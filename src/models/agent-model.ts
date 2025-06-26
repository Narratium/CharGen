/**
 * Agent Model - Real-time Decision Architecture
 * Inspired by Jina AI DeepResearch design philosophy
 * Optimized naming conventions for clarity
 */

// Tool types - pure execution units
export enum ToolType {
  SEARCH = "SEARCH",     // Search and gather information
  ASK_USER = "ASK_USER", // Get user input
  OUTPUT = "OUTPUT"      // Generate final output
}

// Session execution status
export enum SessionStatus {
  IDLE = "idle",
  THINKING = "thinking",
  EXECUTING = "executing", 
  WAITING_USER = "waiting_user",
  COMPLETED = "completed",
  FAILED = "failed"
}

// ============================================================================
// CORE DECISION STRUCTURES
// ============================================================================

/**
 * Real-time tool decision - inspired by DeepResearch action types
 */
export interface ToolDecision {
  tool: ToolType;
  parameters: Record<string, any>;
  reasoning: string;
  priority: number;
}

/**
 * Knowledge entry from search/research results
 */
export interface KnowledgeEntry {
  id: string;
  source: string;
  content: string;
  url?: string;
  relevance_score: number;
  timestamp: string;
}

/**
 * User interaction tracking (questions and responses)
 */
export interface UserInteraction {
  id: string;
  question: string;
  is_initial: boolean;
  parent_id?: string;
  timestamp: string;
  status: "pending" | "answered" | "clarifying";
}

/**
 * Research state - similar to DeepResearch's context management
 */
export interface ResearchState {
  id: string;
  session_id: string;
  
  // Current research objective
  main_objective: string;
  current_focus: string;
  
  // Progress tracking (0-100 scale)
  progress: {
    search_coverage: number;      // How much we've searched
    information_quality: number;  // Quality of gathered info
    answer_confidence: number;    // Confidence in current answer
    user_satisfaction: number;    // Based on user feedback
  };
  
  // Dynamic research status
  active_tasks: string[];         // Current work items
  completed_tasks: string[];      // Finished work items
  knowledge_gaps: string[];       // What we still need to research
  
  // Research artifacts
  knowledge_base: KnowledgeEntry[];
  user_interactions: UserInteraction[];
  
  created_at: string;
  updated_at: string;
}

/**
 * Tool execution result
 */
export interface ExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  knowledge_updates?: KnowledgeEntry[];
  interaction_updates?: UserInteraction[];
  should_continue: boolean;
  tokens_used?: number;
}

// ============================================================================
// EXECUTION CONTEXT
// ============================================================================

/**
 * Tool execution context - unified for all tools
 */
export interface ExecutionContext {
  session_id: string;
  
  // Current research state
  research_state: ResearchState;
  message_history: Message[];
  
  // LLM configuration
  llm_config: {
    model_name: string;
    api_key: string;
    base_url?: string;
    llm_type: "openai" | "ollama";
    temperature: number;
    max_tokens?: number;
  };

}

// ============================================================================
// COMMUNICATION STRUCTURES
// ============================================================================

/**
 * Message in the conversation/research process
 */
export interface Message {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  type: "user_input" | "agent_thinking" | "agent_action" | "agent_output" | "system_info";
  metadata?: {
    tool_used?: ToolType;
    reasoning?: string;
    knowledge_added?: number;
    interactions_added?: number;
  };
  timestamp: string;
}

/**
 * Generation output (specific to character creation application)
 */
export interface GenerationOutput {
  character_data?: {
    name: string;
    description: string;
    personality: string;
    scenario: string;
    first_mes: string;
    mes_example: string;
    creator_notes: string;
    avatar?: string;
    alternate_greetings?: string[];
    tags?: string[];
    [key: string]: any;
  };
  
  worldbook_data?: WorldbookEntry[];
  
  quality_metrics?: {
    completeness: number;
    consistency: number;
    creativity: number;
    user_satisfaction: number;
  };
}

export interface WorldbookEntry {
  id: string;
  uid: string;
  key: string[];
  keysecondary: string[];
  comment: string;
  content: string;
  constant: boolean;
  selective: boolean;
  order: number;
  position: number;
  disable: boolean;
  probability: number;
  useProbability: boolean;
}

// ============================================================================
// MAIN SESSION STRUCTURE
// ============================================================================

/**
 * Research Session - the main data container
 * Represents a complete research/generation session
 */
export interface ResearchSession {
  id: string;
  title: string;
  status: SessionStatus;
  
  // Core session data
  messages: Message[];
  research_state: ResearchState;
  generation_output: GenerationOutput;
  
  // LLM configuration
  llm_config: {
    model_name: string;
    api_key: string;
    base_url?: string;
    llm_type: "openai" | "ollama";
    temperature: number;
    max_tokens?: number;
  };
  
  // Execution tracking
  execution_info: {
    current_iteration: number;
    max_iterations: number;
    start_time: string;
    last_activity: string;
    error_count: number;
    last_error?: string;
    total_tokens_used: number;
    token_budget: number;
  };
  
  created_at: string;
  updated_at: string;
}
