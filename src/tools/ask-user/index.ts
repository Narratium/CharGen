import { BaseRegularTool } from "../base-tool";
import { ToolType, BaseToolContext } from "../../models/agent-model";
import { askUserPrompts } from "./prompts";
import { AskUserThinking } from "./think";
import { ImprovementInstruction } from "../base-think";

/**
 * Ask User Tool - Enhanced with thinking capabilities
 * 询问用户工具 - 增强思考能力
 */
export class AskUserTool extends BaseRegularTool {
  readonly toolType = ToolType.ASK_USER;
  readonly name = "User Interaction";
  readonly description = "Ask user for additional information or clarification";

  protected thinking: AskUserThinking;

  constructor() {
    super();
    this.thinking = new AskUserThinking();
  }

  /**
   * Core work logic - generate questions for user using intelligent routing
   * 核心工作逻辑 - 使用智能路由为用户生成问题
   */
  async doWork(context: BaseToolContext): Promise<any> {
    // Define available sub-tools (currently single, but prepared for future expansion)
    const availableSubTools = [
      "askContextualQuestions"
    ];

    try {
      // Use intelligent routing to select the best sub-tool
      console.log(`🧠 [ASK_USER] Using intelligent routing to select sub-tool...`);
      const routingDecision = await this.thinking.routeToSubTool(context, availableSubTools);
      
      console.log(`🎯 [ASK_USER] Selected sub-tool: ${routingDecision.selected_sub_tool} (confidence: ${routingDecision.confidence}%)`);
      console.log(`📝 [ASK_USER] Reasoning: ${routingDecision.reasoning}`);

      // Route to the selected sub-tool
      switch (routingDecision.selected_sub_tool) {
        case "askContextualQuestions":
          return await this.performAskContextualQuestions(context);
        default:
          // Log unknown sub-tool and throw error instead of fallback
          console.error(`[ASK_USER] Unknown sub-tool: ${routingDecision.selected_sub_tool}`);
          throw new Error(`Unknown sub-tool selected: ${routingDecision.selected_sub_tool}`);
      }
    } catch (error) {
      // Log failure and propagate error instead of fallback
      console.error(`[ASK_USER] Tool execution failed:`, error);
      throw error; // Re-throw to let base class handle
    }
  }

  /**
   * Main contextual questions functionality
   * 主要的上下文问题功能
   */
  private async performAskContextualQuestions(context: BaseToolContext): Promise<any> {
    try {
      // Generate contextual questions using LLM
      const questions = await this.generateContextualQuestions(context);
      
      await this.addMessage(context.conversation_id, "agent", questions);

      return {
        message: questions,
        questionType: "contextual",
        context: {
          hasCharacter: !!context.task_progress.character_data,
          hasWorldbook: !!context.task_progress.worldbook_data && context.task_progress.worldbook_data.length > 0,
          totalIterations: context.task_progress.generation_metadata?.total_iterations || 0,
          messageCount: context.conversation_history.length,
        },
      };
      
    } catch (error) {
      // Log specific failure and throw error instead of fallback
      console.error(`[ASK_USER] Question generation failed:`, error);
      throw new Error(`Question generation failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Improvement logic - generate better questions based on feedback
   * 改进逻辑 - 根据反馈生成更好的问题
   */
  async improve(
    currentResult: any,
    instruction: ImprovementInstruction,
    context: BaseToolContext
  ): Promise<any> {
    try {
      console.log(`🔄 [ASK_USER] Improving questions based on: ${instruction.focus_areas.join(', ')}`);
      
      // Generate improved questions based on instruction
      const improvedQuestions = await this.generateImprovedQuestions(
        currentResult,
        instruction,
        context
      );
      
      await this.addMessage(context.conversation_id, "agent", improvedQuestions);

      return {
        message: improvedQuestions,
        questionType: "improved",
        improvementApplied: instruction.focus_areas,
        context: currentResult.context
      };
      
    } catch (error) {
      // Log improvement failure and throw error instead of fallback
      console.error(`[ASK_USER] Question improvement failed:`, error);
      throw new Error(`Question improvement failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Generate intelligent, contextual questions using LLM
   */
  private async generateContextualQuestions(context: BaseToolContext): Promise<string> {
    // Check if we have valid API configuration
    if (context.llm_config.llm_type === "openai" && !context.llm_config.api_key) {
      throw new Error("No API key configured");
    }
    
    const prompt = this.buildContextualPrompt(
      askUserPrompts.QUESTION_GENERATION_SYSTEM,
      askUserPrompts.QUESTION_GENERATION_HUMAN,
      context
    );

    return await this.executeLLMChain(prompt, {
      task_description: "Generate relevant questions"
    }, context, {
      errorMessage: "Failed to generate contextual questions"
    });
  }

  /**
   * Generate improved questions based on feedback
   */
  private async generateImprovedQuestions(
    currentResult: any,
    instruction: ImprovementInstruction,
    context: BaseToolContext
  ): Promise<string> {
    const improvementPrompt = `Improve the following questions based on these instructions:

FOCUS AREAS: ${instruction.focus_areas.join(', ')}
SPECIFIC REQUESTS: ${instruction.specific_requests.join(', ')}
TARGET QUALITY: ${instruction.quality_target}/100

ORIGINAL QUESTIONS:
${currentResult.message}

Generate improved questions that address the feedback above.`;

    const prompt = this.buildContextualPrompt(
      askUserPrompts.QUESTION_GENERATION_SYSTEM + "\n\nYou are improving existing questions based on feedback.",
      improvementPrompt,
      context
    );

    return await this.executeLLMChain(prompt, {
      improvement_context: "Improving questions based on feedback"
    }, context, {
      errorMessage: "Failed to generate improved questions"
    });
  }

  /**
   * Analyze user input patterns for better question generation
   */
  private analyzeUserInputPatterns(context: BaseToolContext): {
    preferredStyle: string;
    detailLevel: string;
    focusAreas: string[];
  } {
    const userMessages = context.conversation_history.filter(msg => msg.role === "user");
    const allUserText = userMessages.map(msg => msg.content).join(" ").toLowerCase();
    
    // Analyze style preferences
    let preferredStyle = "balanced";
    if (allUserText.includes("detailed") || allUserText.includes("comprehensive")) {
      preferredStyle = "detailed";
    } else if (allUserText.includes("simple") || allUserText.includes("basic")) {
      preferredStyle = "simple";
    }
    
    // Analyze detail level
    let detailLevel = "medium";
    if (allUserText.includes("brief") || allUserText.includes("short")) {
      detailLevel = "low";
    } else if (allUserText.includes("extensive") || allUserText.includes("rich")) {
      detailLevel = "high";
    }
    
    // Extract focus areas
    const focusAreas: string[] = [];
    if (allUserText.includes("character")) focusAreas.push("character");
    if (allUserText.includes("world") || allUserText.includes("setting")) focusAreas.push("worldbook");
    if (allUserText.includes("personality")) focusAreas.push("personality");
    if (allUserText.includes("background") || allUserText.includes("history")) focusAreas.push("background");
    
    return {
      preferredStyle,
      detailLevel,
      focusAreas
    };
  }
} 