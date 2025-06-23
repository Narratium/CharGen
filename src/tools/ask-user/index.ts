import { BaseTool } from "../base-tool";
import { ToolType, ToolExecutionContext, ToolExecutionResult, PlanTask } from "../../models/agent-model";
import { AskUserPrompts } from "./prompts";

/**
 * Ask User Tool - Intelligently gather required information from users
 */
export class AskUserTool extends BaseTool {
  readonly toolType = ToolType.ASK_USER;
  readonly name = "User Interaction";
  readonly description = "Ask user for additional information or clarification";

  async executeToolLogic(task: PlanTask, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    try {
      // Generate contextual questions using LLM
      const questions = await this.generateContextualQuestions(task, context);
      
      await this.addMessage(context.conversation_id, "agent", questions);

      const result = {
        message: questions,
        questionType: "contextual",
        context: {
          currentFocus: context.plan_pool.context.current_focus,
          completedTasks: context.plan_pool.completed_tasks.length,
          currentTasks: context.plan_pool.current_tasks.length,
        },
      };
      
      return this.createSuccessResult(result, {
        userInputRequired: true,
        shouldContinue: false,
        reasoning: "Generated contextual questions for user input"
      });
      
    } catch (error) {
      // Fallback to basic questions based on task analysis
      const fallbackQuestions = this.generateFallbackQuestions(task, context);
      
      await this.addMessage(context.conversation_id, "agent", fallbackQuestions);
      
      return this.createSuccessResult(
        { message: fallbackQuestions, questionType: "fallback" },
        {
          userInputRequired: true,
          shouldContinue: false,
          reasoning: "Used fallback questions due to LLM failure"
        }
      );
    }
  }

  /**
   * Generate intelligent, contextual questions using LLM
   */
  private async generateContextualQuestions(task: PlanTask, context: ToolExecutionContext): Promise<string> {
    // Check if we have valid API configuration
    if (context.llm_config.llm_type === "openai" && !context.llm_config.api_key) {
      throw new Error("No API key configured");
    }
    
    const prompt = await this.createContextualPrompt(
      AskUserPrompts.getQuestionGenerationSystemPrompt(),
      AskUserPrompts.getQuestionGenerationHumanTemplate().replace("{task_description}", task.description),
      task,
      context
    );

    return await this.executeLLMChain(prompt, {}, context, {
      errorMessage: "Failed to generate contextual questions"
    });
  }

  /**
   * Build context information for question generation
   */
  private buildContextInfo(context: ToolExecutionContext): string {
    const info = [];
    
    // Current focus
    info.push(`Current focus: ${context.plan_pool.context.current_focus}`);
    
    // Progress information
    info.push(`Completed tasks: ${context.plan_pool.completed_tasks.length}`);
    info.push(`Current tasks: ${context.plan_pool.current_tasks.length}`);
    
    // What's already been generated
    if (context.current_result.character_data) {
      info.push("Character data: Already generated");
    } else {
      info.push("Character data: Not yet created");
    }
    
    if (context.current_result.worldbook_data && context.current_result.worldbook_data.length > 0) {
      info.push(`Worldbook entries: ${context.current_result.worldbook_data.length} created`);
    } else {
      info.push("Worldbook entries: Not yet created");
    }
    
    // Recent thoughts and decisions
    const recentThoughts = context.thought_buffer.thoughts.slice(-3);
    if (recentThoughts.length > 0) {
      info.push("Recent thoughts:");
      recentThoughts.forEach(thought => {
        info.push(`- ${thought.content.substring(0, 100)}...`);
      });
    }
    
    return info.join("\n");
  }

  /**
   * Generate fallback questions when LLM fails - analyze task description to determine appropriate questions
   */
  private generateFallbackQuestions(task: PlanTask, context: ToolExecutionContext): string {
    const userRequest = context.plan_pool.context.user_request;
    const hasCharacter = !!context.current_result.character_data;
    const hasWorldbook = context.current_result.worldbook_data && context.current_result.worldbook_data.length > 0;
    
    return AskUserPrompts.generateFallbackQuestions(
      task.description,
      userRequest,
      hasCharacter,
      hasWorldbook || false
    );
  }
} 