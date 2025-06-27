import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { 
  ToolType,
  ExecutionContext,
  ExecutionResult,
  Message,
  KnowledgeEntry,
  UserInteraction,
} from "../models/agent-model";
import { ResearchSessionOperations } from "../data/agent/agent-conversation-operations";
import { v4 as uuidv4 } from "uuid";

// ============================================================================
// SIMPLIFIED TOOL ARCHITECTURE - Pure Execution Units
// ============================================================================

/**
 * Tool parameter definition for intelligent parameter selection
 */
export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "array" | "object";
  required: boolean;
  description: string;
  options?: string[]; // For enum-like parameters
  default?: any;
}

/**
 * Detailed tool information including parameter schema
 */
export interface DetailedToolInfo {
  type: ToolType;
  name: string;
  description: string;
  parameters: ToolParameter[];
  examples?: string[];
}

/**
 * Simple tool interface - no thinking, just execution
 */
export interface SimpleTool {
  readonly name: string;
  readonly description: string;
  readonly toolType: ToolType;
  readonly parameters: ToolParameter[]; // Parameter schema for intelligent planning
  
  execute(context: ExecutionContext, parameters: Record<string, any>): Promise<ExecutionResult>;
}

/**
 * Base Tool - Simplified for pure execution
 * No self-improvement, no thinking layers, just direct execution
 */
export abstract class BaseSimpleTool implements SimpleTool {
  abstract readonly toolType: ToolType;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: ToolParameter[]; // Parameter schema for intelligent planning

  /**
   * Main execution method - pure and simple
   */
  async execute(context: ExecutionContext, parameters: Record<string, any>): Promise<ExecutionResult> {
    try {
      console.log(`🛠️ [${this.name}] Starting execution`);
      
      // Direct execution - no thinking loops
      const result = await this.doWork(context, parameters);
      
      console.log(`✅ [${this.name}] Execution completed successfully`);
      return this.createSuccessResult(result);
      
    } catch (error) {
      console.error(`❌ [${this.name}] Execution failed:`, error);
      return this.createFailureResult(error);
    }
  }

  /**
   * Core work logic - implement this in your tool
   */
  protected abstract doWork(context: ExecutionContext, parameters: Record<string, any>): Promise<any>;

  // ============================================================================
  // HELPER METHODS - Common functionality for all tools
  // ============================================================================

  /**
   * Create LLM instance from config
   */
  protected createLLM(config: ExecutionContext["llm_config"]) {
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
   * Execute LLM chain with error handling
   */
  protected async executeLLMChain(
    prompt: ChatPromptTemplate,
    inputData: Record<string, any>,
    context: ExecutionContext,
    options: {
      parseJson?: boolean;
      errorMessage?: string;
    } = {}
  ): Promise<any> {
    try {
      const llm = this.createLLM(context.llm_config);
      const chain = prompt.pipe(llm).pipe(new StringOutputParser());
      
      const response = await chain.invoke(inputData);
      
      if (options.parseJson) {
        return this.parseJSONResponse(response);
      }
      
      return response;
    } catch (error) {
      const errorMsg = options.errorMessage || `${this.name} LLM execution failed`;
      console.error(errorMsg, error);
      throw new Error(`${errorMsg}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Parse JSON response from LLM
   */
  protected parseJSONResponse(response: string): any {
    try {
      // Extract JSON from response if it's wrapped in markdown or other text
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(response);
    } catch (error) {
      console.error("Failed to parse JSON response:", response);
      throw new Error("Invalid JSON response from LLM");
    }
  }

  /**
   * Build conversation summary for context
   */
  protected buildConversationSummary(messages: Message[]): string {
    return messages
      .slice(-10) // Last 10 messages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join("\n");
  }

  /**
   * Build knowledge base summary
   */
  protected buildKnowledgeBaseSummary(knowledgeBase: KnowledgeEntry[]): string {
    if (knowledgeBase.length === 0) {
      return "No knowledge gathered yet.";
    }
    
    return knowledgeBase
      .slice(0, 5) // Top 5 most relevant
      .map(k => `- ${k.source}: ${k.content.substring(0, 100)}...`)
      .join("\n");
  }

  /**
   * Build user questions summary
   */
  protected buildUserInteractionsSummary(UserInteractions: UserInteraction[]): string {
    if (UserInteractions.length === 0) {
      return "No user questions recorded.";
    }
    
    return UserInteractions
      .map(q => `- ${q.is_initial ? '[Initial]' : '[Follow-up]'} ${q.question}`)
      .join("\n");
  }

  /**
   * Build current task context summary including task queue
   */
  protected buildTaskContextSummary(context: ExecutionContext): string {
    const state = context.research_state;
    
    // Build task queue summary
    const pendingTasks = state.task_queue?.filter(t => t.status === "pending") || [];
    const activeTasks = state.task_queue?.filter(t => t.status === "active") || [];
    const completedTasks = state.task_queue?.filter(t => t.status === "completed") || [];
    
    return `
Main Objective: ${state.main_objective}

Task Queue Status:
- Pending Tasks (${pendingTasks.length}): ${pendingTasks.map(t => t.description).join(", ")}
- Active Tasks (${activeTasks.length}): ${activeTasks.map(t => t.description).join(", ")}
- Completed Tasks (${completedTasks.length}): ${completedTasks.map(t => t.description).join(", ")}

Sub-questions: ${state.sub_questions?.join(", ") || "None"}
Knowledge Gaps: ${state.knowledge_gaps?.join(", ") || "None"}

Progress Status:
- Search Coverage: ${state.progress.search_coverage}%
- Information Quality: ${state.progress.information_quality}%
- Answer Confidence: ${state.progress.answer_confidence}%
- User Satisfaction: ${state.progress.user_satisfaction}%

Last Reflection: ${state.last_reflection || "Never"}
`.trim();
  }

  /**
   * Create knowledge entry from search results
   */
  protected createKnowledgeEntry(
    source: string,
    content: string,
    url?: string,
    relevanceScore: number = 70
  ): KnowledgeEntry {
    return {
      id: uuidv4(),
      source,
      content,
      url,
      relevance_score: relevanceScore,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Create user question entry
   */
  protected createUserInteraction(
    question: string,
    isInitial: boolean = false,
    parentQuestionId?: string
  ): UserInteraction {
    return {
      id: uuidv4(),
      question,
      is_initial: isInitial,
      parent_id: parentQuestionId,
      timestamp: new Date().toISOString(),
      status: "pending",
    };
  }

  /**
   * Add message to conversation
   */
  protected async addMessage(
    conversationId: string,
    role: "agent" | "system",
    content: string,
    messageType: "agent_thinking" | "agent_action" | "agent_output" | "system_info" = "agent_action",
    metadata?: Record<string, any>
  ): Promise<void> {
    await ResearchSessionOperations.addMessage(conversationId, {
      role,
      content,
      type: messageType,
      metadata: {
        tool_used: this.toolType,
        ...metadata,
      },
    });
  }

  /**
   * Create success result
   */
  protected createSuccessResult(
    result: any,
    options: {
      shouldContinue?: boolean;
      knowledgeUpdates?: KnowledgeEntry[];
      UserInteractionsUpdates?: UserInteraction[];
      tokensUsed?: number;
    } = {}
  ): ExecutionResult {
    return {
      success: true,
      result,
      should_continue: options.shouldContinue ?? true,
      knowledge_updates: options.knowledgeUpdates,
      interaction_updates: options.UserInteractionsUpdates,
      tokens_used: options.tokensUsed,
    };  
  }

  /**
   * Create failure result
   */
  protected createFailureResult(
    error: any,
    options: {
      shouldContinue?: boolean;
      customMessage?: string;
    } = {}
  ): ExecutionResult {
    const errorMessage = options.customMessage || 
      (error instanceof Error ? error.message : String(error));

    return {
      success: false,
      error: `${this.name} failed: ${errorMessage}`,
      should_continue: options.shouldContinue ?? true,
    };
  }

  /**
   * Estimate token usage (rough estimation)
   */
  protected estimateTokenUsage(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
} 