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
  static async createSession(
    title: string,
    llmConfig: ResearchSession["llm_config"],
    initialUserRequest: string
  ): Promise<ResearchSession> {
    const conversationId = uuidv4();

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
      // Sequential task management - will be populated by task decomposition
      task_queue: [], // Empty initially - will be filled by task decomposition
      completed_tasks: [],
      knowledge_gaps: [],
      knowledge_base: [],
      user_interactions: [{
        id: uuidv4(),
        question: initialUserRequest,
        is_initial: true,
        status: "pending",
      }],
    };

    // Create initial character progress
    const GenerationOutput: GenerationOutput = {
    };

    // Create initial user message
    const initialMessage: Message = {
      id: uuidv4(),
      role: "user",
      content: initialUserRequest,
      type: "user_input",
    };

    const session: ResearchSession = {
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
        error_count: 0,
        total_tokens_used: 0,
        token_budget: 100000, // 100K tokens default budget
      },
    };

    await this.saveSession(session);
    return session;
  }

  /**
   * Get conversation by ID
   */
  static async getSessionById(sessionId: string): Promise<ResearchSession | null> {
    const sessions = await this.getAllSessions();
    return sessions.find(s => s.id === sessionId) || null;
  }

  /**
   * Get all conversations
   */
  static async getAllSessions(): Promise<ResearchSession[]> {
    try {
      const data = await readData(AGENT_CONVERSATIONS_FILE);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error("Failed to load sessions:", error);
      return [];
    }
  }

  /**
   * Save conversation to storage
   */
  static async saveSession(session: ResearchSession): Promise<void> {
    const sessions = await this.getAllSessions();
    const existingIndex = sessions.findIndex(s => s.id === session.id);
    
    if (existingIndex >= 0) {
      sessions[existingIndex] = session;
    } else {
      sessions.push(session);
    }

    await writeData(AGENT_CONVERSATIONS_FILE, sessions);
  }

  /**
   * Update conversation status
   */
  static async updateStatus(sessionId: string, status: SessionStatus): Promise<void> {
    const session = await this.getSessionById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.status = status;
    await this.saveSession(session);
  }

  /**
   * Add message to conversation
   */
  static async addMessage(
    sessionId: string,
    messageData: Omit<Message, "id">
  ): Promise<Message> {
    const session = await this.getSessionById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const message: Message = {
      ...messageData,
      id: uuidv4(),
    };

    session.messages.push(message);
    await this.saveSession(session);
    
    return message;
  }

  /**
   * Update task state
   */
  static async updateResearchState(
    sessionId: string,
    updates: Partial<Omit<ResearchState, "id" | "session_id">>
  ): Promise<void> {
    const session = await this.getSessionById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Update task state
    Object.assign(session.research_state, updates);

    await this.saveSession(session);
  }

  /**
   * Update character progress
   */
  static async updateGenerationOutput(
    sessionId: string,
    updates: Partial<GenerationOutput>
  ): Promise<void> {
    const session = await this.getSessionById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Update character progress
    Object.assign(session.generation_output, updates);

    await this.saveSession(session);
  }

  /**
   * Add knowledge entries to the knowledge base
   */
  static async addKnowledgeEntries(
    sessionId: string,
    entries: KnowledgeEntry[]
  ): Promise<void> {
    const session = await this.getSessionById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.research_state.knowledge_base.push(...entries);

    await this.saveSession(session);
  }

  /**
   * Add user questions to the questions array
   */
  static async addUserInteractions(
    sessionId: string,
    questions: UserInteraction[]
  ): Promise<void> {
    const session = await this.getSessionById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.research_state.user_interactions.push(...questions);

    await this.saveSession(session);
  }

  /**
   * Increment iteration counter
   */
  static async incrementIteration(sessionId: string): Promise<number> {
    const session = await this.getSessionById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.execution_info.current_iteration++;
    await this.saveSession(session);
    
    return session.execution_info.current_iteration;
  }

  /**
   * Record token usage
   */
  static async recordTokenUsage(sessionId: string, tokensUsed: number): Promise<void> {
    const session = await this.getSessionById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.execution_info.total_tokens_used += tokensUsed;
    await this.saveSession(session);
  }

  /**
   * Record error
   */
  static async recordError(sessionId: string, error: string): Promise<void> {
    const session = await this.getSessionById(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.execution_info.error_count++;
    session.execution_info.last_error = error;
    await this.saveSession(session);
  }

  /**
   * Delete conversation
   */
  static async deleteSession(sessionId: string): Promise<void> {
    const sessions = await this.getAllSessions();
    const updatedSessions = sessions.filter(s => s.id !== sessionId);
    await writeData(AGENT_CONVERSATIONS_FILE, updatedSessions);
  }

  /**
   * Clear all sessions from the data file
   */
  static async clearAll(): Promise<void> {
    await writeData(AGENT_CONVERSATIONS_FILE, []);
  }

  /**
   * Get conversation summary for display
   */
  static async getSessionSummary(sessionId: string): Promise<{
    title: string;
    status: SessionStatus;
    messageCount: number;
    hasCharacter: boolean;
    hasWorldbook: boolean;
    completionPercentage: number;
    knowledgeBaseSize: number;
  } | null> {
    const session = await this.getSessionById(sessionId);
    if (!session) return null;

    const completion = session.research_state.progress;
    const averageCompletion = (
      completion.search_coverage + 
      completion.information_quality + 
      completion.answer_confidence + 
      completion.user_satisfaction
    ) / 4;

    return {
      title: session.title,
      status: session.status,
      messageCount: session.messages.length,
      hasCharacter: !!session.generation_output.character_data,
      hasWorldbook: !!session.generation_output.worldbook_data && session.generation_output.worldbook_data.length > 0,
      completionPercentage: Math.round(averageCompletion),
      knowledgeBaseSize: session.research_state.knowledge_base.length,
    };
  }
} 
