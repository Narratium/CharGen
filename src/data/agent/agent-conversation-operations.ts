import { AgentConversation, AgentStatus, ConversationMessage, TaskProgress, PlanningContext } from "../../models/agent-model";
import { readData, writeData, AGENT_CONVERSATIONS_FILE } from "../local-storage";
import { v4 as uuidv4 } from "uuid";

/**
 * Agent Conversation Operations - Redesigned
 * Handles conversation data with clear separation of concerns
 */
export class AgentConversationOperations {


  /**
   * Create a new agent conversation with clean initial state
   */
  static async createConversation(
    title: string,
    llmConfig: AgentConversation["llm_config"],
    initialUserRequest: string
  ): Promise<AgentConversation> {
    const conversationId = uuidv4();
    const now = new Date().toISOString();

    // Create initial task progress
    const taskProgress: TaskProgress = {
      id: uuidv4(),
      conversation_id: conversationId,
      generation_metadata: {
        total_iterations: 0,
        tools_used: [],
        last_updated: now,
      },
      created_at: now,
      updated_at: now,
    };

    // Create initial planning context
    const planningContext: PlanningContext = {
      id: uuidv4(),
      conversation_id: conversationId,
      goals: [],
      current_tasks: [],
      completed_tasks: [],
      context: {
        user_request: initialUserRequest,
        current_focus: "Initial setup and planning",
        constraints: [],
        preferences: {},
        failure_history: {
          failed_tool_attempts: {},
          recent_failures: [],
        },
      },
      created_at: now,
      updated_at: now,
    };

    // Create initial user message
    const initialMessage: ConversationMessage = {
      id: uuidv4(),
      role: "user",
      content: initialUserRequest,
      message_type: "user_input",
      timestamp: now,
    };

    const conversation: AgentConversation = {
      id: conversationId,
      title,
      status: AgentStatus.IDLE,
      messages: [initialMessage],
      task_progress: taskProgress,
      planning_context: planningContext,
      llm_config: llmConfig,
      execution_metadata: {
        current_iteration: 0,
        max_iterations: 50,
        start_time: now,
        last_activity: now,
        error_count: 0,
      },
      created_at: now,
      updated_at: now,
    };

    await this.saveConversation(conversation);
    return conversation;
  }

  /**
   * Get conversation by ID
   */
  static async getConversationById(conversationId: string): Promise<AgentConversation | null> {
    const conversations = await this.getAllConversations();
    return conversations.find(c => c.id === conversationId) || null;
  }

  /**
   * Get all conversations
   */
  static async getAllConversations(): Promise<AgentConversation[]> {
    try {
      const data = await readData(AGENT_CONVERSATIONS_FILE);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error("Failed to load conversations:", error);
      return [];
    }
  }

  /**
   * Save conversation to storage
   */
  static async saveConversation(conversation: AgentConversation): Promise<void> {
    const conversations = await this.getAllConversations();
    const existingIndex = conversations.findIndex(c => c.id === conversation.id);
    
    conversation.updated_at = new Date().toISOString();
    conversation.execution_metadata.last_activity = conversation.updated_at;

    if (existingIndex >= 0) {
      conversations[existingIndex] = conversation;
    } else {
      conversations.push(conversation);
    }

    await writeData(AGENT_CONVERSATIONS_FILE, conversations);
  }

  /**
   * Update conversation with partial data
   */
  static async updateConversation(conversation: AgentConversation): Promise<void> {
    await this.saveConversation(conversation);
  }

  /**
   * Update conversation status
   */
  static async updateStatus(conversationId: string, status: AgentStatus): Promise<void> {
    const conversation = await this.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    conversation.status = status;
    await this.saveConversation(conversation);
  }

  /**
   * Add message to conversation
   */
  static async addMessage(
    conversationId: string,
    messageData: Omit<ConversationMessage, "id" | "timestamp">
  ): Promise<ConversationMessage> {
    const conversation = await this.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const message: ConversationMessage = {
      ...messageData,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
    };

    conversation.messages.push(message);
    await this.saveConversation(conversation);
    
    return message;
  }

  /**
   * Update task progress
   */
  static async updateTaskProgress(
    conversationId: string,
    updates: Partial<Omit<TaskProgress, "id" | "conversation_id" | "created_at">>
  ): Promise<void> {
    const conversation = await this.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Update task progress
    Object.assign(conversation.task_progress, updates);
    conversation.task_progress.updated_at = new Date().toISOString();
    conversation.task_progress.generation_metadata.last_updated = conversation.task_progress.updated_at;

    await this.saveConversation(conversation);
  }

  /**
   * Update planning context
   */
  static async updatePlanningContext(
    conversationId: string,
    updates: Partial<Omit<PlanningContext, "id" | "conversation_id" | "created_at">>
  ): Promise<void> {
    const conversation = await this.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Update planning context
    Object.assign(conversation.planning_context, updates);
    conversation.planning_context.updated_at = new Date().toISOString();

    await this.saveConversation(conversation);
  }

  /**
   * Increment iteration count
   */
  static async incrementIteration(conversationId: string): Promise<number> {
    const conversation = await this.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    conversation.execution_metadata.current_iteration++;
    conversation.task_progress.generation_metadata.total_iterations = conversation.execution_metadata.current_iteration;
    
    await this.saveConversation(conversation);
    return conversation.execution_metadata.current_iteration;
  }

  /**
   * Record tool usage in task progress
   */
  static async recordToolUsage(conversationId: string, toolType: string): Promise<void> {
    const conversation = await this.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const toolsUsed = conversation.task_progress.generation_metadata.tools_used;
    if (!toolsUsed.includes(toolType as any)) {
      toolsUsed.push(toolType as any);
    }

    await this.saveConversation(conversation);
  }

  /**
   * Record error in execution metadata
   */
  static async recordError(conversationId: string, error: string): Promise<void> {
    const conversation = await this.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    conversation.execution_metadata.error_count++;
    conversation.execution_metadata.last_error = error;

    await this.saveConversation(conversation);
  }

  /**
   * Delete conversation
   */
  static async deleteConversation(conversationId: string): Promise<void> {
    const conversations = await this.getAllConversations();
    const filteredConversations = conversations.filter(c => c.id !== conversationId);
    await writeData(AGENT_CONVERSATIONS_FILE, filteredConversations);
  }

  /**
   * Get conversation summary for display
   */
  static async getConversationSummary(conversationId: string): Promise<{
    title: string;
    status: AgentStatus;
    messageCount: number;
    hasCharacter: boolean;
    hasWorldbook: boolean;
    lastActivity: string;
    completionPercentage: number;
  } | null> {
    const conversation = await this.getConversationById(conversationId);
    if (!conversation) return null;

    const hasCharacter = !!conversation.task_progress.character_data;
    const hasWorldbook = !!conversation.task_progress.worldbook_data && conversation.task_progress.worldbook_data.length > 0;
    
    let completionPercentage = 0;
    if (hasCharacter && hasWorldbook) {
      completionPercentage = 100;
    } else if (hasCharacter || hasWorldbook) {
      completionPercentage = 50;
    }

    return {
      title: conversation.title,
      status: conversation.status,
      messageCount: conversation.messages.length,
      hasCharacter,
      hasWorldbook,
      lastActivity: conversation.execution_metadata.last_activity,
      completionPercentage,
    };
  }
} 
