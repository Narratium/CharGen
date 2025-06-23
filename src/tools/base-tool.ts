import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { 
  ToolType,
  BaseToolContext,
  PlanToolContext,
  ToolExecutionResult,
  PlanTask,
  ConversationMessage,
} from "../models/agent-model";
import { BaseThinking, EvaluationResult, ImprovementInstruction } from "./base-think";

// ============================================================================
// SIMPLE TOOL ARCHITECTURE WITH SELF-IMPROVEMENT
// ============================================================================

/**
 * Basic tool interface - all tools implement this
 */
export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly toolType: ToolType;
  
  canHandle(task: PlanTask): boolean;
  validate(context: BaseToolContext | PlanToolContext): boolean;
}

/**
 * Regular tool interface - for simple tools that don't need planning context
 */
export interface RegularTool extends Tool {
  execute(context: BaseToolContext): Promise<any>;
}

/**
 * Plan tool interface - for tools that need planning context
 */
export interface PlanTool extends Tool {
  execute(context: PlanToolContext): Promise<any>;
}

/**
 * Enhanced Regular Tool with self-improvement
 * 具备自我改进能力的常规工具
 */
export abstract class BaseRegularTool extends BaseThinking implements RegularTool {
  abstract readonly toolType: ToolType;
  abstract readonly name: string;
  abstract readonly description: string;

  constructor() {
    super("BaseTool");
  }

  /**
   * Main execution with self-improvement loop
   * 主执行方法，包含自我改进循环
   */
  async execute(context: BaseToolContext): Promise<any> {
    let attempt = 1;
    let result = await this.doWork(context);
    
    // Self-improvement loop
    while (attempt <= this.maxImprovementAttempts) {
      const evaluation = await this.evaluate(result, context, attempt);
      
      // If good enough, return
      if (evaluation.is_satisfied || evaluation.next_action === "complete") {
        if (attempt > 1) {
          console.log(`✅ [${this.name}] Improved result after ${attempt} attempts. Quality: ${evaluation.quality_score}/100`);
        }
      return result;
      }
      
      // Try to improve
      if (evaluation.next_action === "improve" && attempt < this.maxImprovementAttempts) {
        console.log(`🔄 [${this.name}] Quality: ${evaluation.quality_score}/100. Improving...`);
        
        const instruction = await this.generateImprovement(result, evaluation, context);
        result = await this.improve(result, instruction, context);
        attempt++;
      } else {
        console.log(`⏹️ [${this.name}] Stopping after ${attempt} attempts. Final quality: ${evaluation.quality_score}/100`);
        break;
      }
    }
    
    return result;
  }

  /**
   * Core work logic - implement this in your tool
   * 核心工作逻辑 - 在你的工具中实现这个
   */
  abstract doWork(context: BaseToolContext): Promise<any>;

  /**
   * Improvement logic - implement this in your tool
   * 改进逻辑 - 在你的工具中实现这个
   */
  abstract improve(
    currentResult: any,
    instruction: ImprovementInstruction,
    context: BaseToolContext
  ): Promise<any>;

  /**
   * Default task validation
   */
  canHandle(task: PlanTask): boolean {
    return task.tool === this.toolType;
  }

  /**
   * Default context validation
   */
  validate(context: BaseToolContext): boolean {
    return !!(context.conversation_id && context.task_progress);
  }

  // ============================================================================
  // HELPER METHODS - Common functionality for all tools
  // ============================================================================

  /**
   * Create LLM instance from config
   */
  protected createLLM(config: BaseToolContext["llm_config"]) {
    if (config.llm_type === "openai") {
      return new ChatOpenAI({
        modelName: config.model_name,
        openAIApiKey: config.api_key,
        configuration: {
          baseURL: config.base_url,
        },
        temperature: config.temperature,
        maxTokens: config.max_tokens,
        streaming: false,
      });
    } else if (config.llm_type === "ollama") {
      return new ChatOllama({
        model: config.model_name,
        baseUrl: config.base_url || "http://localhost:11434",
        temperature: config.temperature,
        streaming: false,
      });
    }

    throw new Error(`Unsupported LLM type: ${config.llm_type}`);
  }

  /**
   * Build context-aware prompt for regular tools
   */
  protected buildContextualPrompt(
    systemPrompt: string,
    humanTemplate: string,
    context: BaseToolContext
  ): ChatPromptTemplate {
    // Pre-build context that doesn't change per request
    const conversationSummary = this.buildConversationSummary(context.conversation_history);
    const progressSummary = this.buildProgressSummary(context.task_progress);
    const fullContext = `${progressSummary}\n${conversationSummary}`;
    
    // Create template that can accept variables
    return ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      ["human", fullContext + "\n\n" + humanTemplate],
    ]);
  }

  /**
   * Execute LLM chain with error handling
   */
  protected async executeLLMChain(
    prompt: ChatPromptTemplate,
    inputData: Record<string, any>,
    context: BaseToolContext,
    options: {
      parseJson?: boolean;
      fallbackValue?: any;
      errorMessage?: string;
    } = {}
  ): Promise<any> {
    try {
      const llm = this.createLLM(context.llm_config);
      const chain = prompt.pipe(llm).pipe(new StringOutputParser());
      const response = await chain.invoke(inputData);
      
      if (options.parseJson) {
        try {
          const cleanedResponse = this.extractJsonFromResponse(response);
          return JSON.parse(cleanedResponse);
        } catch (parseError) {
          console.error(`JSON parsing failed for response: "${response.substring(0, 500)}..."`);
          throw parseError;
        }
      }
      
      return response;
    } catch (error) {
      console.error(`LLM execution failed: ${error instanceof Error ? error.message : error}`);
      
      if (options.fallbackValue !== undefined) {
        return options.fallbackValue;
      }
      
      throw new Error(options.errorMessage || `LLM execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract JSON from response
   */
  protected extractJsonFromResponse(response: string): string {
    let cleaned = response.trim();
    
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    
    let jsonStart = -1;
    let jsonEnd = -1;
    
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '{' || cleaned[i] === '[') {
        jsonStart = i;
        break;
      }
    }
    
    for (let i = cleaned.length - 1; i >= 0; i--) {
      if (cleaned[i] === '}' || cleaned[i] === ']') {
            jsonEnd = i + 1;
            break;
          }
        }
    
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonStart < jsonEnd) {
      return cleaned.substring(jsonStart, jsonEnd);
    }
    
    return cleaned;
  }

  /**
   * Build conversation summary
   */
  /**
   * Build conversation summary including message_type
   * @param messages - Array of conversation messages
   * @returns Formatted conversation summary string
   */
  protected buildConversationSummary(messages: ConversationMessage[]): string {
    // If there are no messages, return a default message
    if (messages.length === 0) {
      return "No conversation history available.";
    }

    let summary = "=== CONVERSATION HISTORY ===\n";
    // Only include the last 10 messages for brevity
    const recentMessages = messages.slice(-10);

    for (const message of recentMessages) {
      // Format timestamp to local time string
      const timestamp = new Date(message.timestamp).toLocaleTimeString();
      // Include message_type if available, otherwise use 'N/A'
      const messageType = (message as any).message_type ? (message as any).message_type : 'N/A';
      // Add message details to the summary, including message_type
      summary += `[${timestamp}] ${message.role.toUpperCase()} (${messageType}): ${message.content.substring(0, 200)}\n`;
    }

    return summary + "\n";
  }

  /**
   * Build progress summary
   */
  protected buildProgressSummary(taskProgress: any): string {
    const hasCharacter = !!taskProgress.character_data;
    const hasWorldbook = !!taskProgress.worldbook_data && taskProgress.worldbook_data.length > 0;
    
    let summary = "=== CURRENT PROGRESS ===\n";
    
    if (hasCharacter) {
      summary += `✅ Character Card: COMPLETE\n`;
      summary += `   Name: ${taskProgress.character_data.name || 'N/A'}\n`;
    } else {
      summary += `❌ Character Card: NOT GENERATED\n`;
    }
    
    if (hasWorldbook) {
      summary += `✅ Worldbook: COMPLETE (${taskProgress.worldbook_data.length} entries)\n`;
    } else {
      summary += `❌ Worldbook: NOT GENERATED\n`;
    }

    return summary + "\n";
  }

  /**
   * Add message to conversation (logging for now)
   */
  protected async addMessage(
    conversationId: string,
    role: "agent" | "system",
    content: string,
    messageType: "agent_thinking" | "agent_action" | "agent_output" | "system_info" = "agent_output"
  ): Promise<void> {
    console.log(`📝 [${messageType.toUpperCase()}] ${role}: ${content}`);
  }

  /**
   * Create success result
   */
  protected createSuccessResult(
    result: any,
    options: {
      shouldContinue?: boolean;
      shouldUpdatePlan?: boolean;
      userInputRequired?: boolean;
      reasoning?: string;
    } = {}
  ): ToolExecutionResult {
    return {
      success: true,
      result,
      should_continue: options.shouldContinue ?? true,
      should_update_plan: options.shouldUpdatePlan ?? false,
      user_input_required: options.userInputRequired ?? false,
      reasoning: options.reasoning,
    };
  }
}

/**
 * Enhanced Plan Tool with self-improvement
 * 具备自我改进能力的计划工具
 */
export abstract class BasePlanTool extends BaseThinking implements PlanTool {
  abstract readonly toolType: ToolType;
  abstract readonly name: string;
  abstract readonly description: string;

  constructor() {
    super("BasePlanTool");
  }

  /**
   * Main execution with self-improvement loop
   * 主执行方法，包含自我改进循环
   */
  async execute(context: PlanToolContext): Promise<any> {
    let attempt = 1;
    let result = await this.doWork(context);
    
    // Self-improvement loop
    while (attempt <= this.maxImprovementAttempts) {
      const evaluation = await this.evaluate(result, context, attempt);
      
      // If good enough, return
      if (evaluation.is_satisfied || evaluation.next_action === "complete") {
        if (attempt > 1) {
          console.log(`✅ [${this.name}] Improved result after ${attempt} attempts. Quality: ${evaluation.quality_score}/100`);
        }
        return result;
      }
      
      // Try to improve
      if (evaluation.next_action === "improve" && attempt < this.maxImprovementAttempts) {
        console.log(`🔄 [${this.name}] Quality: ${evaluation.quality_score}/100. Improving...`);
        
        const instruction = await this.generateImprovement(result, evaluation, context);
        result = await this.improve(result, instruction, context);
        attempt++;
      } else {
        console.log(`⏹️ [${this.name}] Stopping after ${attempt} attempts. Final quality: ${evaluation.quality_score}/100`);
        break;
      }
    }
    
    return result;
  }

  /**
   * Core work logic - implement this in your tool
   * 核心工作逻辑 - 在你的工具中实现这个
   */
  abstract doWork(context: PlanToolContext): Promise<any>;

  /**
   * Improvement logic - implement this in your tool
   * 改进逻辑 - 在你的工具中实现这个
   */
  abstract improve(
    currentResult: any,
    instruction: ImprovementInstruction,
    context: PlanToolContext
  ): Promise<any>;

  /**
   * Default task validation
   */
  canHandle(task: PlanTask): boolean {
    return task.tool === this.toolType;
  }

  /**
   * Default context validation
   */
  validate(context: PlanToolContext): boolean {
    return !!(context.conversation_id && context.task_progress && context.planning_context);
  }

  // ============================================================================
  // HELPER METHODS - Common functionality for plan tools
  // ============================================================================

  /**
   * Create LLM instance from config
   */
  protected createLLM(config: PlanToolContext["llm_config"]) {
    if (config.llm_type === "openai") {
      return new ChatOpenAI({
        modelName: config.model_name,
        openAIApiKey: config.api_key,
        configuration: {
          baseURL: config.base_url,
        },
        temperature: config.temperature,
        maxTokens: config.max_tokens,
        streaming: false,
      });
    } else if (config.llm_type === "ollama") {
      return new ChatOllama({
        model: config.model_name,
        baseUrl: config.base_url || "http://localhost:11434",
        temperature: config.temperature,
        streaming: false,
      });
    }

    throw new Error(`Unsupported LLM type: ${config.llm_type}`);
  }

  /**
   * Build planning-aware prompt with full context
   */
  protected buildPlanningPrompt(
    systemPrompt: string,
    humanTemplate: string,
    context: PlanToolContext
  ): ChatPromptTemplate {
    // Pre-build context that doesn't change per request
    const conversationSummary = this.buildConversationSummary(context.conversation_history);
    const progressSummary = this.buildProgressSummary(context.task_progress);
    const planningSummary = this.buildPlanningContextSummary(context.planning_context);
    const fullContext = `${progressSummary}\n${planningSummary}\n${conversationSummary}`;
    
    // Create template that can accept variables
    return ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      ["human", fullContext + "\n\n" + humanTemplate],
    ]);
  }

  /**
   * Execute LLM chain with error handling for planning tools
   */
  protected async executeLLMChain(
    prompt: ChatPromptTemplate,
    inputData: Record<string, any>,
    context: PlanToolContext,
    options: {
      parseJson?: boolean;
      fallbackValue?: any;
      errorMessage?: string;
    } = {}
  ): Promise<any> {
    try {
      const llm = this.createLLM(context.llm_config);
      const chain = prompt.pipe(llm).pipe(new StringOutputParser());
      const response = await chain.invoke(inputData);
      
      if (options.parseJson) {
        try {
          const cleanedResponse = this.extractJsonFromResponse(response);
          return JSON.parse(cleanedResponse);
        } catch (parseError) {
          console.error(`JSON parsing failed for response: "${response.substring(0, 500)}..."`);
          throw parseError;
        }
      }
      
      return response;
    } catch (error) {
      console.error(`LLM execution failed: ${error instanceof Error ? error.message : error}`);
      
      if (options.fallbackValue !== undefined) {
        return options.fallbackValue;
      }
      
      throw new Error(options.errorMessage || `LLM execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract JSON from response
   */
  protected extractJsonFromResponse(response: string): string {
    let cleaned = response.trim();
    
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    
    let jsonStart = -1;
    let jsonEnd = -1;
    
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '{' || cleaned[i] === '[') {
        jsonStart = i;
        break;
      }
    }
    
    for (let i = cleaned.length - 1; i >= 0; i--) {
      if (cleaned[i] === '}' || cleaned[i] === ']') {
        jsonEnd = i + 1;
        break;
      }
    }
    
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonStart < jsonEnd) {
      return cleaned.substring(jsonStart, jsonEnd);
    }
    
    return cleaned;
  }

  /**
   * Build conversation summary
   */
  protected buildConversationSummary(messages: ConversationMessage[]): string {
    // If there are no messages, return a default message
    if (messages.length === 0) {
      return "No conversation history available.";
    }

    let summary = "=== CONVERSATION HISTORY ===\n";
    // Only include the last 10 messages for brevity
    const recentMessages = messages.slice(-10);

    for (const message of recentMessages) {
      // Format timestamp to local time string
      const timestamp = new Date(message.timestamp).toLocaleTimeString();
      // Include message_type if available, otherwise use 'N/A'
      const messageType = (message as any).message_type ? (message as any).message_type : 'N/A';
      // Add message details to the summary, including message_type
      summary += `[${timestamp}] ${message.role.toUpperCase()} (${messageType}): ${message.content.substring(0, 200)}\n`;
    }

    return summary + "\n";
  }

  /**
   * Build progress summary
   */
  protected buildProgressSummary(taskProgress: any): string {
    const hasCharacter = !!taskProgress.character_data;
    const hasWorldbook = !!taskProgress.worldbook_data && taskProgress.worldbook_data.length > 0;
    
    let summary = "=== CURRENT PROGRESS ===\n";
    
    if (hasCharacter) {
      summary += `✅ Character Card: COMPLETE\n`;
      summary += `   Name: ${taskProgress.character_data.name || 'N/A'}\n`;
    } else {
      summary += `❌ Character Card: NOT GENERATED\n`;
    }
    
    if (hasWorldbook) {
      summary += `✅ Worldbook: COMPLETE (${taskProgress.worldbook_data.length} entries)\n`;
    } else {
      summary += `❌ Worldbook: NOT GENERATED\n`;
    }

    return summary + "\n";
  }

  /**
   * Build planning context summary
   */
  protected buildPlanningContextSummary(planningContext: any): string {
    const pendingTasks = planningContext.current_tasks.filter((t: any) => t.status === 'pending');
    const completedTasks = planningContext.completed_tasks.slice(-5);
    
    let summary = "=== PLANNING CONTEXT ===\n";
    summary += `Original Request: "${planningContext.context.user_request}"\n`;
    summary += `Current Focus: ${planningContext.context.current_focus}\n`;
    summary += `Pending Tasks: ${pendingTasks.length}\n`;
    summary += `Completed Tasks: ${planningContext.completed_tasks.length}\n\n`;
    
    if (pendingTasks.length > 0) {
      summary += "Current Pending Tasks:\n";
      for (const task of pendingTasks.slice(0, 5)) {
        summary += `  - "${task.description}" (${task.tool}, Priority: ${task.priority})\n`;
      }
      summary += "\n";
    }
    
    return summary;
  }
}

/**
 * Context Manager for building appropriate contexts for tools
 * 上下文管理器，为工具构建适当的上下文
 */
export class ContextManager {
  /**
   * Build context for regular tools
   */
  static buildRegularContext(
    conversationId: string,
    taskProgress: any,
    conversationHistory: ConversationMessage[],
    llmConfig: any
  ): BaseToolContext {
    return {
      conversation_id: conversationId,
      task_progress: taskProgress,
      conversation_history: conversationHistory,
      llm_config: llmConfig
    };
  }

  /**
   * Build context for plan tools
   */
  static buildPlanContext(
    conversationId: string,
    taskProgress: any,
    conversationHistory: ConversationMessage[],
    llmConfig: any,
    planningContext: any
  ): PlanToolContext {
    return {
      conversation_id: conversationId,
      task_progress: taskProgress,
      conversation_history: conversationHistory,
      llm_config: llmConfig,
      planning_context: planningContext
    };
  }
} 
