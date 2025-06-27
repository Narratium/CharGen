import { 
  ResearchSession, 
  SessionStatus, 
  Message, 
  ResearchState,      
  UserInteraction,
  KnowledgeEntry,
  GenerationOutput,
} from "../../models/agent-model";
import { readData, writeData, AGENT_CONVERSATIONS_FILE } from "../local-storage";
import { v4 as uuidv4 } from "uuid";

/**
 * Agent Conversation Operations - Simplified for Real-time Architecture
 */
export class ResearchSessionOperations {

  /**
   * Create a new agent conversation with simplified initial state
   */
  static async createConversation(
    title: string,
    llmConfig: ResearchSession["llm_config"],
    initialUserRequest: string
  ): Promise<ResearchSession> {
    const conversationId = uuidv4();
    const now = new Date().toISOString();

    // Create initial task state
    const ResearchState: ResearchState = {
      id: uuidv4(),
      session_id: conversationId,
      main_objective: initialUserRequest,
      progress: {
        search_coverage: 0,
        information_quality: 0,
        answer_confidence: 0,
        user_satisfaction: 0,
      },
      // Enhanced task management - will be populated by task decomposition
      task_queue: [], // Empty initially - will be filled by initializeWithTaskDecomposition
      completed_tasks: [],
      knowledge_gaps: [
        "Character background details",
        "World setting information", 
        "User preferences and constraints"
      ],
      sub_questions: [], // Will be populated by task decomposition
      knowledge_base: [],
      user_interactions: [{
        id: uuidv4(),
        question: initialUserRequest,
        is_initial: true,
        timestamp: now,
        status: "pending",
      }],
      // Reflection tracking
      last_reflection: "", // Will be set during initialization
      reflection_trigger: null,
      created_at: now,
      updated_at: now,
    };

    // Create initial character progress
    const GenerationOutput: GenerationOutput = {
      quality_metrics: {
        completeness: 0,
        consistency: 0,
        creativity: 0,
        user_satisfaction: 0,
      },
    };

    // Create initial user message
    const initialMessage: Message = {
      id: uuidv4(),
      role: "user",
      content: initialUserRequest,
      type: "user_input",
      timestamp: now,
    };

    const conversation: ResearchSession = {
      id: conversationId,
      title,
      status: SessionStatus.IDLE,
      messages: [initialMessage],
      research_state: ResearchState,
      generation_output: GenerationOutput,
      llm_config: llmConfig,
      execution_info: {
        current_iteration: 0,
        max_iterations: 50,
        start_time: now,
        last_activity: now,
        error_count: 0,
        total_tokens_used: 0,
        token_budget: 100000, // 100K tokens default budget
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
  static async getConversationById(conversationId: string): Promise<ResearchSession | null> {
    const conversations = await this.getAllConversations();
    return conversations.find(c => c.id === conversationId) || null;
  }

  /**
   * Get all conversations
   */
  static async getAllConversations(): Promise<ResearchSession[]> {
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
  static async saveConversation(conversation: ResearchSession): Promise<void> {
    const conversations = await this.getAllConversations();
    const existingIndex = conversations.findIndex(c => c.id === conversation.id);
    
    conversation.updated_at = new Date().toISOString();
    conversation.execution_info.last_activity = conversation.updated_at;

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
  static async updateConversation(conversation: ResearchSession): Promise<void> {
    await this.saveConversation(conversation);
  }

  /**
   * Update conversation status
   */
  static async updateStatus(conversationId: string, status: SessionStatus): Promise<void> {
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
    messageData: Omit<Message, "id" | "timestamp">
  ): Promise<Message> {
    const conversation = await this.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const message: Message = {
      ...messageData,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
    };

    conversation.messages.push(message);
    await this.saveConversation(conversation);
    
    return message;
  }

  /**
   * Update task state
   */
  static async updateResearchState(
    conversationId: string,
    updates: Partial<Omit<ResearchState, "id" | "session_id" | "created_at">>
  ): Promise<void> {
    const conversation = await this.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Update task state
    Object.assign(conversation.research_state, updates);
    conversation.research_state.updated_at = new Date().toISOString();

    await this.saveConversation(conversation);
  }

  /**
   * Update character progress
   */
  static async updateGenerationOutput(
    conversationId: string,
    updates: Partial<GenerationOutput>
  ): Promise<void> {
    const conversation = await this.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Update character progress
    Object.assign(conversation.generation_output, updates);

    await this.saveConversation(conversation);
  }

  /**
   * Add knowledge entries to the knowledge base
   */
  static async addKnowledgeEntries(
    conversationId: string,
    entries: KnowledgeEntry[]
  ): Promise<void> {
    const conversation = await this.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    conversation.research_state.knowledge_base.push(...entries);
    conversation.research_state.updated_at = new Date().toISOString();

    await this.saveConversation(conversation);
  }

  /**
   * Add user questions to the questions array
   */
  static async addUserInteractions(
    conversationId: string,
    questions: UserInteraction[]
  ): Promise<void> {
    const conversation = await this.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    conversation.research_state.user_interactions.push(...questions);
    conversation.research_state.updated_at = new Date().toISOString();

    await this.saveConversation(conversation);
  }

  /**
   * Increment iteration counter
   */
  static async incrementIteration(conversationId: string): Promise<number> {
    const conversation = await this.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    conversation.execution_info.current_iteration++;
    await this.saveConversation(conversation);
    
    return conversation.execution_info.current_iteration;
  }

  /**
   * Record token usage
   */
  static async recordTokenUsage(conversationId: string, tokensUsed: number): Promise<void> {
    const conversation = await this.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    conversation.execution_info.total_tokens_used += tokensUsed;
    await this.saveConversation(conversation);
  }

  /**
   * Record error
   */
  static async recordError(conversationId: string, error: string): Promise<void> {
    const conversation = await this.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    conversation.execution_info.error_count++;
    conversation.execution_info.last_error = error;
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
    status: SessionStatus;
    messageCount: number;
    hasCharacter: boolean;
    hasWorldbook: boolean;
    lastActivity: string;
    completionPercentage: number;
    knowledgeBaseSize: number;
  } | null> {
    const conversation = await this.getConversationById(conversationId);
    if (!conversation) return null;

    const completion = conversation.research_state.progress;
    const averageCompletion = (
      completion.search_coverage + 
      completion.information_quality + 
      completion.answer_confidence + 
      completion.user_satisfaction
    ) / 4;

    return {
      title: conversation.title,
      status: conversation.status,
      messageCount: conversation.messages.length,
      hasCharacter: !!conversation.generation_output.character_data,
      hasWorldbook: !!conversation.generation_output.worldbook_data && conversation.generation_output.worldbook_data.length > 0,
      lastActivity: conversation.execution_info.last_activity,
      completionPercentage: Math.round(averageCompletion),
      knowledgeBaseSize: conversation.research_state.knowledge_base.length,
    };
  }
} 
