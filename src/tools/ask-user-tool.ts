import { BaseTool } from "./base-tool";
import { ToolType, ToolExecutionContext, ToolExecutionResult, PlanTask } from "../models/agent-model";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

/**
 * Ask User Tool - Dynamically generate contextual questions using LLM
 */
export class AskUserTool extends BaseTool {
  readonly toolType = ToolType.ASK_USER;
  readonly name = "Ask User";
  readonly description = "Ask user for additional information or clarification using intelligent question generation";

  async executeTask(task: PlanTask, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    console.log(`💬 [Ask User Tool] Executing task: ${task.description}`);
    console.log(`🤖 [Ask User Tool] Will determine questions based on task description and current context`);
    
    await this.addThought(
      context.conversation_id,
      "reasoning",
      `Analyzing task "${task.description}" to determine what questions to ask user`,
      task.id,
    );

    try {
      // Generate contextual questions using internal logic and LLM
      console.log("🎯 [Ask User Tool] Analyzing task and generating appropriate questions...");
      const questions = await this.generateContextualQuestions(task, context);
      console.log("✅ [Ask User Tool] Questions generated successfully");
      
      await this.addMessage(context.conversation_id, "agent", questions);

      return {
        success: true,
        result: { 
          message: questions,
          questionType: "contextual",
          context: {
            currentFocus: context.plan_pool.context.current_focus,
            completedTasks: context.plan_pool.completed_tasks.length,
            currentTasks: context.plan_pool.current_tasks.length,
          },
        },
        user_input_required: true,
        should_continue: false,
      };
    } catch (error) {
      console.error("❌ [Ask User Tool] Failed to generate questions:", error);
      
      // Fallback to basic questions based on task analysis
      console.log("🔄 [Ask User Tool] Using fallback questions based on task analysis...");
      const fallbackQuestions = this.generateFallbackQuestions(task, context);
      console.log("✅ [Ask User Tool] Fallback questions generated");
      
      await this.addMessage(context.conversation_id, "agent", fallbackQuestions);
      
      return {
        success: true,
        result: { message: fallbackQuestions },
        user_input_required: true,
        should_continue: false,
      };
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
    
    const llm = this.createLLM(context.llm_config);
    
    // Build context information
    const contextInfo = this.buildContextInfo(context);
    
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", `You are an expert character and worldbook creator. Generate intelligent, specific questions to gather the information needed to create the perfect character and world.

Guidelines:
- Ask specific, targeted questions based on the current context
- Consider what information is already available
- Focus on the most critical missing pieces
- Be conversational and engaging
- Ask 3-5 focused questions maximum
- Consider the user's original request and current progress

Question types to consider:
- Character personality and background details
- World setting and atmosphere
- Specific themes or elements they want
- Constraints or preferences
- Creative direction and style
- Cultural or historical references

Format your response as a natural, conversational message that includes the questions.`],
      ["human", `User's original request: {user_request}

Current task: {task_description}
Task parameters: {task_params}

Current context:
{context_info}

What specific questions should I ask the user to gather the missing information needed for this task?`],
    ]);

    try {
      const chain = prompt.pipe(llm).pipe(new StringOutputParser());
      const questions = await chain.invoke({
        user_request: context.plan_pool.context.user_request,
        task_description: task.description,
        task_params: JSON.stringify(task.parameters),
        context_info: contextInfo
      });
      return questions;
    } catch (error) {
      console.error("🔍 [Ask User Tool] Detailed error:", error);
      throw new Error(`Failed to generate contextual questions: ${error instanceof Error ? error.message : String(error)}`);
    }
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
    const taskDesc = task.description.toLowerCase();
    const userRequest = context.plan_pool.context.user_request;
    
    // Analyze task description to determine question focus
    if (taskDesc.includes("requirement") || taskDesc.includes("preference") || taskDesc.includes("tone") || taskDesc.includes("style")) {
      return `I need to understand your preferences better to create the perfect character and worldbook. Based on your request "${userRequest}" and the current task "${task.description}", could you tell me:

1. What kind of tone or atmosphere are you looking for? (e.g., dark and gritty, hopeful and heroic, mysterious and magical)
2. Are there any specific themes or elements you want emphasized?
3. What aspects of this concept excite you most?
4. Any particular style or inspiration sources you'd like me to draw from?`;

    } else if (taskDesc.includes("character") || taskDesc.includes("personality") || taskDesc.includes("background")) {
      return `I'm working on the character details for your request. To make them compelling and unique, I need to understand:

1. What kind of personality should this character have? What drives them?
2. What's their role or position in this world? Are they a leader, rebel, survivor, etc.?
3. What challenges or conflicts do they face?
4. Any specific traits, abilities, or background elements you envision?`;

    } else if (taskDesc.includes("world") || taskDesc.includes("setting") || taskDesc.includes("environment") || taskDesc.includes("location")) {
      return `I'm developing the world and setting for your concept. To create a rich, immersive environment, could you help me with:

1. What does this world feel like? What's the overall atmosphere?
2. What are the key locations or environments that matter?
3. What kind of society or social structure exists?
4. Are there any unique rules, technologies, or magical elements in this world?`;

    } else if (taskDesc.includes("clarif") || taskDesc.includes("detail") || taskDesc.includes("specific")) {
      return `I need some additional details to continue with "${task.description}". Could you provide more information about:

1. What specific aspects are most important to you?
2. Are there any particular directions you'd like me to take?
3. What elements should I focus on or avoid?
4. Any additional context that might help me better understand your vision?`;

    } else {
      // General fallback based on current progress
      const hasCharacter = !!context.current_result.character_data;
      const hasWorldbook = context.current_result.worldbook_data && context.current_result.worldbook_data.length > 0;
      
      if (!hasCharacter && !hasWorldbook) {
        return `I'm getting started on your request "${userRequest}". To create the best character and worldbook, I need to understand:

1. What's the core concept or theme you want to explore?
2. What kind of character would fit this world?
3. What mood or atmosphere should this have?
4. Any specific elements or constraints I should consider?`;
      } else {
        return `I'm continuing work on your character and worldbook. For the current task "${task.description}", could you provide more details about what you'd like me to focus on or any specific preferences you have?`;
      }
    }
  }
}
