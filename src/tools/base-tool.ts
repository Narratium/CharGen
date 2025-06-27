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
// PURE EXECUTION TOOL ARCHITECTURE - Following DeepResearch Design
// ============================================================================

/**
 * Tool parameter definition for planning phase
 * Following DeepResearch approach - simple parameter schema
 */
export interface ToolParameter {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  required: boolean;
  description: string;
  options?: any[];
  default?: any;
  items?: ToolParameter | { type: string; description?: string; };
  properties?: { [key: string]: Omit<ToolParameter, 'name' | 'required'> & { required?: boolean } };
}

/**
 * Detailed tool information for planning
 */
export interface DetailedToolInfo {
  type: ToolType;
  name: string;
  description: string;
  parameters: ToolParameter[];
}

/**
 * Simple tool interface - pure execution only
 */
export interface SimpleTool {
  readonly name: string;
  readonly description: string;
  readonly toolType: ToolType;
  readonly parameters: ToolParameter[];
  
  execute(context: ExecutionContext, parameters: Record<string, any>): Promise<ExecutionResult>;
}

/**
 * Base Tool - Pure Execution Unit (Following DeepResearch Philosophy)
 * No LLM calls, no parameter generation, just direct execution
 */
export abstract class BaseSimpleTool implements SimpleTool {
  abstract readonly toolType: ToolType;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: ToolParameter[];

  /**
   * Pure execution method - no LLM calls, just execute with given parameters
   */
  async execute(context: ExecutionContext, parameters: Record<string, any>): Promise<ExecutionResult> {
    try {
      console.log(`🛠️ [${this.name}] Executing with parameters:`, parameters);
      
      // Direct execution with provided parameters
      const result = await this.doWork(parameters, context);
      
      console.log(`✅ [${this.name}] Execution completed`);
      return this.createSuccessResult(result);
      
    } catch (error) {
      console.error(`❌ [${this.name}] Execution failed:`, error);
      return this.createFailureResult(error);
    }
  }

  /**
   * Core work logic - implement this in your tool
   * This should be pure execution without any LLM calls
   */
  protected abstract doWork(parameters: Record<string, any>, context: ExecutionContext): Promise<any>;

  // ============================================================================
  // HELPER METHODS - Pure utilities without LLM calls
  // ============================================================================

  /**
   * Create knowledge entry from results
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
   * Create user interaction entry
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
      interactionUpdates?: UserInteraction[];
      tokensUsed?: number;
    } = {}
  ): ExecutionResult {
    return {
      success: true,
      result,
      should_continue: options.shouldContinue ?? true,
      knowledge_updates: options.knowledgeUpdates,
      interaction_updates: options.interactionUpdates,
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
   * Build simple summaries for context (no LLM calls)
   */
  protected buildKnowledgeBaseSummary(knowledgeBase: KnowledgeEntry[]): string {
    if (knowledgeBase.length === 0) {
      return "No knowledge gathered yet.";
    }
    
    return knowledgeBase
      .slice(0, 5)
      .map(k => `- ${k.source}: ${k.content.substring(0, 100)}...`)
      .join("\n");
  }

  protected buildUserInteractionsSummary(interactions: UserInteraction[]): string {
    if (interactions.length === 0) {
      return "No user questions recorded.";
    }
    
    return interactions
      .map(q => `- ${q.is_initial ? '[Initial]' : '[Follow-up]'} ${q.question}`)
      .join("\n");
  }
} 