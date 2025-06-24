/**
 * Redesigned Agent Model - Clear Context Architecture
 * Separates concerns between different tool types and provides clear context interfaces
 */

// Core tool types available to the agent
export enum ToolType {
  PLAN = "PLAN",
  ASK_USER = "ASK_USER",
  SEARCH = "SEARCH",
  OUTPUT = "OUTPUT"
}

// Agent execution status
export enum AgentStatus {
  IDLE = "idle",
  THINKING = "thinking",
  EXECUTING = "executing",
  WAITING_USER = "waiting_user",
  COMPLETED = "completed",
  FAILED = "failed"
}

// ============================================================================
// CONVERSATION CONTEXT - The core context all tools need
// ============================================================================

/**
 * Core conversation message structure
 * This represents the full dialogue history in role:content format
 */
export interface ConversationMessage {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  message_type: "user_input" | "agent_thinking" | "agent_action" | "agent_output" | "system_info";
  metadata?: {
    task_id?: string;
    tool_used?: ToolType;
    reasoning?: string;
    attachments?: any[];
  };
  timestamp: string;
}

/**
 * Current task progress state (result of all work so far)
 * This represents the character card and worldbook generation progress
 */
export interface TaskProgress {
  id: string;
  conversation_id: string;
  
  // Character generation progress
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
  
  // Worldbook generation progress
  worldbook_data?: WorldbookEntry[];
  
  // Additional progress tracking
  integration_notes?: string;
  quality_metrics?: {
    completeness: number;
    consistency: number;
    creativity: number;
    user_satisfaction: number;
  };
  
  generation_metadata: {
    total_iterations: number;
    tools_used: ToolType[];
    last_updated: string;
  };
  
  created_at: string;
  updated_at: string;
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
// PLANNING CONTEXT - Additional context needed only by planning tools
// ============================================================================

/**
 * Task structure for planning
 */
export interface PlanTask {
  id: string;
  description: string;
  tool: ToolType;
  status: "pending" | "executing" | "completed" | "failed" | "obsolete";
  result?: any;
  reasoning?: string;
  priority: number;
  created_at: string;
  completed_at?: string;
  obsolete_reason?: string;
}

/**
 * Goal structure for hierarchical planning
 */
export interface Goal {
  id: string;
  description: string;
  type: "main_goal" | "sub_goal" | "task";
  parent_id?: string;
  children: string[];
  status: "pending" | "in_progress" | "completed" | "failed";
  checkpoint?: {
    progress: number;
    description: string;
    timestamp: string;
  };
  metadata?: Record<string, any>;
}

/**
 * Planning state - only needed by PLAN tools
 */
export interface PlanningContext {
  id: string;
  conversation_id: string;
  
  // Goal hierarchy
  goals: Goal[];
  
  // Task management
  current_tasks: PlanTask[];
  completed_tasks: PlanTask[];
  
  // Planning metadata
  context: {
    user_request: string;
    current_focus: string;
    constraints: string[];
    preferences: Record<string, any>;
    failure_history: {
      failed_tool_attempts: Record<string, number>;
      recent_failures: Array<{
        tool: string;
        description: string;
        error: string;
        timestamp: string;
        attempt_count: number;
      }>;
    };
  };
  
  created_at: string;
  updated_at: string;
}

// ============================================================================
// CONTEXT INTERFACES - Clear separation by tool type
// ============================================================================

/**
 * Base context that ALL tools receive
 * Contains only essential conversation and progress information
 */
export interface BaseToolContext {
  conversation_id: string;
  
  // Current task progress (character card + worldbook state)
  task_progress: TaskProgress;
  
  // Full conversation history (user inputs + agent responses + system messages)
  conversation_history: ConversationMessage[];
  
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

/**
 * Extended context for PLAN tools only
 * Includes planning-specific information in addition to base context
 */
export interface PlanToolContext extends BaseToolContext {
  // Planning state (tasks, goals, etc.)
  planning_context: PlanningContext;
}

/**
 * Generic tool execution result
 */
export interface ToolExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  should_update_plan?: boolean;
  should_continue?: boolean;
  user_input_required?: boolean;
  reasoning?: string;
}

// ============================================================================
// MAIN CONVERSATION STRUCTURE - Simplified
// ============================================================================

/**
 * Main agent conversation - simplified and focused
 */
export interface AgentConversation {
  id: string;
  title: string;
  status: AgentStatus;
  
  // Core conversation data
  messages: ConversationMessage[];
  task_progress: TaskProgress;
  
  // Planning data (separate from core conversation)
  planning_context: PlanningContext;
  
  // LLM configuration
  llm_config: {
    model_name: string;
    api_key: string;
    base_url?: string;
    llm_type: "openai" | "ollama";
    temperature: number;
    max_tokens?: number;
  };
  
  // Execution metadata
  execution_metadata: {
    current_iteration: number;
    max_iterations: number;
    start_time: string;
    last_activity: string;
    error_count: number;
    last_error?: string;
  };
  
  created_at: string;
  updated_at: string;
}