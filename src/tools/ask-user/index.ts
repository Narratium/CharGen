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

  private thinking: AskUserThinking;

  constructor() {
    super();
    this.thinking = new AskUserThinking();
  }

  /**
   * Core work logic - generate questions for user
   * 核心工作逻辑 - 为用户生成问题
   */
  async doWork(context: BaseToolContext): Promise<any> {
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
      // Fallback to basic questions
      const fallbackQuestions = this.generateFallbackQuestions(context);
      
      await this.addMessage(context.conversation_id, "agent", fallbackQuestions);
      
      return {
        message: fallbackQuestions,
        questionType: "fallback",
        error: error instanceof Error ? error.message : String(error)
      };
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
      console.warn(`[ASK_USER] Improvement failed, using original result:`, error);
      return currentResult; // Return original if improvement fails
    }
  }

  /**
   * Implement thinking capabilities using public methods
   */
  async evaluate(result: any, context: BaseToolContext, attempt: number = 1) {
    return await this.thinking.evaluateResult(result, context, attempt);
  }

  async generateImprovement(result: any, evaluation: any, context: BaseToolContext) {
    return await this.thinking.generateImprovementInstruction(result, evaluation, context);
  }

  protected buildEvaluationPrompt = () => { throw new Error("Use evaluate() instead"); };
  protected buildImprovementPrompt = () => { throw new Error("Use generateImprovement() instead"); };
  protected executeThinkingChain = () => { throw new Error("Use thinking.executeThinking() instead"); };

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
   * Generate fallback questions when LLM fails
   */
  private generateFallbackQuestions(context: BaseToolContext): string {
    const hasCharacter = !!context.task_progress.character_data;
    const hasWorldbook = !!context.task_progress.worldbook_data && context.task_progress.worldbook_data.length > 0;
    
    // Extract original user request from conversation history
    const userMessages = context.conversation_history.filter(msg => msg.role === "user");
    const originalRequest = userMessages[0]?.content || "character and worldbook generation";
    
    return this.buildFallbackQuestions(
      originalRequest,
      hasCharacter,
      hasWorldbook
    );
  }

  /**
   * Build fallback questions based on current state
   */
  private buildFallbackQuestions(
    originalRequest: string,
    hasCharacter: boolean,
    hasWorldbook: boolean
  ): string {
    let questions = "I need some more information to help you better:\n\n";
    
    // Character-related questions
    if (!hasCharacter) {
      questions += "**About the Character:**\n";
      questions += "• What type of character are you looking for? (personality, background, role)\n";
      questions += "• Are there any specific traits or characteristics you want emphasized?\n";
      questions += "• What setting or world should this character fit into?\n\n";
    } else {
      questions += "**Character Refinement:**\n";
      questions += "• Are you satisfied with the current character, or would you like any changes?\n";
      questions += "• Should I adjust any specific aspects of the character?\n\n";
    }
    
    // Worldbook-related questions
    if (!hasWorldbook) {
      questions += "**About the World:**\n";
      questions += "• What aspects of the world should I focus on? (locations, history, culture, etc.)\n";
      questions += "• Are there specific elements or lore you want included?\n";
      questions += "• How detailed should the world information be?\n\n";
    } else {
      questions += "**Worldbook Enhancement:**\n";
      questions += "• Do you want me to expand on any particular world elements?\n";
      questions += "• Are there missing aspects of the world you'd like me to add?\n\n";
    }
    
    // General questions
    questions += "**General Preferences:**\n";
    questions += "• Is there anything specific about your original request that I should focus on more?\n";
    questions += "• Do you have any particular style or tone preferences?\n";
    questions += "\nPlease provide any additional details that would help me create exactly what you're looking for!";
    
    return questions;
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