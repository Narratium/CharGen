import { AgentEngine } from "./agent-engine";
import { ResearchSessionOperations } from "../data/agent/agent-conversation-operations";
import { ResearchSession, SessionStatus } from "../models/agent-model";

// Define user input callback type
type UserInputCallback = (message?: string) => Promise<string>;

/**
 * Agent Service - Simplified for Real-time Decision Architecture
 * High-level API for character+worldbook generation with real-time planning
 */
export class AgentService {
  private engines: Map<string, AgentEngine> = new Map();

  constructor() {
    // Initialize storage on construction
    this.initialize();
  }

  /**
   * Initialize service with storage
   */
  private async initialize(): Promise<void> {
    try {
      const { initializeDataFiles } = await import('../data/local-storage');
      await initializeDataFiles();
    } catch (error) {
      console.error('Failed to initialize AgentService:', error);
    }
  }

  /**
   * Start a new character generation conversation with user input callback
   */
  async startGeneration(
    title: string,
    userRequest: string,
    llmConfig: {
      model_name: string;
      api_key: string;
      base_url?: string;
      llm_type: "openai" | "ollama";
      temperature?: number;
      max_tokens?: number;
    },
    userInputCallback?: UserInputCallback,
  ): Promise<{
    conversationId: string;
    success: boolean;
    result?: any;
    error?: string;
  }> {
    try {
      // Create new conversation with updated interface
      const conversation = await ResearchSessionOperations.createConversation(
        title,
        {
          model_name: llmConfig.model_name,
          api_key: llmConfig.api_key,
          base_url: llmConfig.base_url,
          llm_type: llmConfig.llm_type,
          temperature: llmConfig.temperature || 0.7,
          max_tokens: llmConfig.max_tokens,
        },
        userRequest
      );
      
      // Create agent engine with user input callback
      const engine = new AgentEngine(conversation.id, userInputCallback);
      this.engines.set(conversation.id, engine);
      
      // Start execution with callback
      const result = await engine.start(userInputCallback);
      
      return {
        conversationId: conversation.id,
        success: result.success,
        result: result.result,
        error: result.error,
      };
      
    } catch (error) {
      console.error("Failed to start generation:", error);
      return {
        conversationId: "",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get conversation status and progress with new data structure
   */
  async getConversationStatus(conversationId: string): Promise<{
    conversation: ResearchSession | null;
    status: SessionStatus;
    progress: {
      completedTasks: number;
      totalIterations: number;
      knowledgeBaseSize: number;
      UserInteractions: number;
    };
    hasResult: boolean;
    result?: any;
  }> {
    try {
      const conversation = await ResearchSessionOperations.getConversationById(conversationId);
      if (!conversation) {
        return {
          conversation: null,
          status: SessionStatus.FAILED,
          progress: {
            completedTasks: 0,
            totalIterations: 0,
            knowledgeBaseSize: 0,
            UserInteractions: 0,
          },
          hasResult: false,
        };
      }
      
      // Check completion using new character_progress structure
      const hasCharacterData = !!conversation.generation_output.character_data;
      const hasWorldbookData = !!conversation.generation_output.worldbook_data && conversation.generation_output.worldbook_data.length > 0;
      const hasResult = hasCharacterData && hasWorldbookData;
      
      return {
        conversation,
        status: conversation.status,
        progress: {
          completedTasks: conversation.research_state.completed_tasks.length,
          totalIterations: conversation.execution_info.current_iteration,
          knowledgeBaseSize: conversation.research_state.knowledge_base.length,
          UserInteractions: conversation.research_state.user_interactions.length,
        },
        hasResult,
        result: hasResult ? {
          character_data: conversation.generation_output.character_data,
          worldbook_data: conversation.generation_output.worldbook_data,
          quality_metrics: conversation.generation_output.quality_metrics,
          knowledge_base: conversation.research_state.knowledge_base,
          completion_status: conversation.research_state.progress,
        } : undefined,
      };
      
    } catch (error) {
      console.error("Failed to get conversation status:", error);
      return {
        conversation: null,
        status: SessionStatus.FAILED,
        progress: {
          completedTasks: 0,
          totalIterations: 0,
          knowledgeBaseSize: 0,
          UserInteractions: 0,
        },
        hasResult: false,
      };
    }
  }

  /**
   * List all conversations for a user
   */
  async listConversations(): Promise<ResearchSession[]> {
    try {
      return await ResearchSessionOperations.getAllConversations();
    } catch (error) {
      console.error("Failed to list conversations:", error);
      return [];
    }
  }

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string): Promise<boolean> {
    try {
      // Remove engine from memory
      this.engines.delete(conversationId);
      
      // Delete from storage
      await ResearchSessionOperations.deleteConversation(conversationId);
      return true;
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      return false;
    }
  }

  /**
   * Get conversation messages for UI display
   */
  async getMessages(conversationId: string): Promise<{
    messages: any[];
    messageCount: number;
  }> {
    try {
      const conversation = await ResearchSessionOperations.getConversationById(conversationId);
      if (!conversation) {
        return {
          messages: [],
          messageCount: 0,
        };
      }
      
      return {
        messages: conversation.messages,
        messageCount: conversation.messages.length,
      };
      
    } catch (error) {
      console.error("Failed to get conversation messages:", error);
      return {
        messages: [],
        messageCount: 0,
      };
    }
  }

  /**
   * Get task state for debugging (replaces planning status)
   */
  async getResearchState(conversationId: string): Promise<{
    mainObjective: string;
    completedTasks: string[];
    knowledgeGaps: string[];
    completionStatus: any;
    knowledgeBase: any[];
    UserInteractions: any[];
  }> {
    try {
      const conversation = await ResearchSessionOperations.getConversationById(conversationId);
      if (!conversation) {
        return {
          mainObjective: "",
          completedTasks: [],
          knowledgeGaps: [],
          completionStatus: {},
          knowledgeBase: [],
          UserInteractions: [],
        };
      }
      
      return {
        mainObjective: conversation.research_state.main_objective,
        completedTasks: conversation.research_state.completed_tasks,
        knowledgeGaps: conversation.research_state.knowledge_gaps,
        completionStatus: conversation.research_state.progress,
        knowledgeBase: conversation.research_state.knowledge_base,
        UserInteractions: conversation.research_state.user_interactions,
      };
      
    } catch (error) {
      console.error("Failed to get task state:", error);
      return {
        mainObjective: "",
        completedTasks: [],
        knowledgeGaps: [],
        completionStatus: {},
        knowledgeBase: [],
        UserInteractions: [],
      };
    }
  }

  /**
   * Get character progress for UI display
   */
  async getGenerationOutput(conversationId: string): Promise<{
    hasCharacter: boolean;
    hasWorldbook: boolean;
    completionPercentage: number;
    characterData?: any;
    worldbookData?: any[];
    qualityMetrics?: any;
    searchCoverage: number;
    informationQuality: number;
    answerConfidence: number;
    userSatisfaction: number;
  }> {
    try {
      const conversation = await ResearchSessionOperations.getConversationById(conversationId);
      if (!conversation) {
        return {
          hasCharacter: false,
          hasWorldbook: false,
          completionPercentage: 0,
          searchCoverage: 0,
          informationQuality: 0,
          answerConfidence: 0,
          userSatisfaction: 0,
        };
      }
      
      const hasCharacter = !!conversation.generation_output.character_data;
      const hasWorldbook = !!conversation.generation_output.worldbook_data && conversation.generation_output.worldbook_data.length > 0;
      
      // Calculate completion percentage from completion status
      const completion = conversation.research_state.progress;
      const completionPercentage = (
        completion.search_coverage + 
        completion.information_quality + 
        completion.answer_confidence + 
        completion.user_satisfaction
      ) / 4;
      
      return {
        hasCharacter,
        hasWorldbook,
        completionPercentage: Math.round(completionPercentage),
        characterData: conversation.generation_output.character_data,
        worldbookData: conversation.generation_output.worldbook_data,
        qualityMetrics: conversation.generation_output.quality_metrics,
        searchCoverage: completion.search_coverage,
        informationQuality: completion.information_quality,
        answerConfidence: completion.answer_confidence,
        userSatisfaction: completion.user_satisfaction,
      };
      
    } catch (error) {
      console.error("Failed to get character progress:", error);
      return {
        hasCharacter: false,
        hasWorldbook: false,
        completionPercentage: 0,
        searchCoverage: 0,
        informationQuality: 0,
        answerConfidence: 0,
        userSatisfaction: 0,
      };
    }
  }

  /**
   * Export conversation data
   */
  async exportConversation(conversationId: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      const conversation = await ResearchSessionOperations.getConversationById(conversationId);
      if (!conversation) {
        return {
          success: false,
          error: "Conversation not found",
        };
      }
      
      const exportData = {
        conversation,
        exportedAt: new Date().toISOString(),
        version: "4.0", // Updated to new simplified architecture
        architecture: "real-time-decision",
      };
      
      return {
        success: true,
        data: exportData,
      };
      
    } catch (error) {
      console.error("Failed to export conversation:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get generation statistics with new data structure
   */
  async getGenerationStats(): Promise<{
    totalConversations: number;
    completedGenerations: number;
    successRate: number;
    averageIterations: number;
    statusBreakdown: Record<string, number>;
    averageQualityScore: number;
    averageKnowledgeBaseSize: number;
    averageTokensUsed: number;
  }> {
    try {
      const conversations = await ResearchSessionOperations.getAllConversations();
      
      const statusBreakdown: Record<string, number> = {};
      let totalIterations = 0;
      let completedGenerations = 0;
      let totalQualityScore = 0;
      let qualityScoreCount = 0;
      let totalKnowledgeBaseSize = 0;
      let totalTokensUsed = 0;
      
      conversations.forEach(conv => {
        // Count by status
        statusBreakdown[conv.status] = (statusBreakdown[conv.status] || 0) + 1;
        
        // Count iterations
        totalIterations += conv.execution_info.current_iteration;
        
        // Count tokens used
        totalTokensUsed += conv.execution_info.total_tokens_used || 0;
        
        // Count knowledge base size
        totalKnowledgeBaseSize += conv.research_state.knowledge_base.length;
        
        // Count completed generations
        if (conv.status === SessionStatus.COMPLETED && 
            conv.generation_output.character_data && 
            conv.generation_output.worldbook_data && 
            conv.generation_output.worldbook_data.length > 0) {
          completedGenerations++;
        }
        
        // Quality metrics
        if (conv.generation_output.quality_metrics?.completeness) {
          totalQualityScore += conv.generation_output.quality_metrics.completeness;
          qualityScoreCount++;
        }
      });
      
      const successRate = conversations.length > 0 
        ? (completedGenerations / conversations.length) * 100 
        : 0;
        
      const averageIterations = conversations.length > 0 
        ? totalIterations / conversations.length 
        : 0;
        
      const averageQualityScore = qualityScoreCount > 0
        ? totalQualityScore / qualityScoreCount
        : 0;

      const averageKnowledgeBaseSize = conversations.length > 0
        ? totalKnowledgeBaseSize / conversations.length
        : 0;

      const averageTokensUsed = conversations.length > 0
        ? totalTokensUsed / conversations.length
        : 0;
      
      return {
        totalConversations: conversations.length,
        completedGenerations,
        successRate,
        averageIterations,
        statusBreakdown,
        averageQualityScore,
        averageKnowledgeBaseSize,
        averageTokensUsed,
      };
      
    } catch (error) {
      console.error("Failed to get generation stats:", error);
      return {
        totalConversations: 0,
        completedGenerations: 0,
        successRate: 0,
        averageIterations: 0,
        statusBreakdown: {},
        averageQualityScore: 0,
        averageKnowledgeBaseSize: 0,
        averageTokensUsed: 0,
      };
    }
  }

  /**
   * Get conversation summary for quick display
   */
  async getConversationSummary(conversationId: string): Promise<{
    title: string;
    status: SessionStatus;
    messageCount: number;
    hasCharacter: boolean;
    hasWorldbook: boolean;
    completionPercentage: number;
    knowledgeBaseSize: number;
  } | null> {
    try {
      return await ResearchSessionOperations.getConversationSummary(conversationId);
    } catch (error) {
      console.error("Failed to get conversation summary:", error);
      return null;
    }
  }

  /**
   * Cleanup resources for a conversation
   */
  async cleanup(conversationId: string): Promise<void> {
    this.engines.delete(conversationId);
  }

  /**
   * Get engine for conversation (for advanced usage)
   */
  getEngine(conversationId: string): AgentEngine | undefined {
    return this.engines.get(conversationId);
  }
}

// Singleton instance
export const agentService = new AgentService(); 
 
