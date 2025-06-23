import { AgentEngine } from "./agent-engine";
import { AgentConversationOperations } from "../data/agent/agent-conversation-operations";
import { PlanningOperations } from "../data/agent/plan-pool-operations";
import { AgentConversation, AgentStatus } from "../models/agent-model";

// Define user input callback type
type UserInputCallback = (message?: string) => Promise<string>;

/**
 * Agent Service - Redesigned for Clear Context Architecture
 * High-level API for character+worldbook generation with clean interfaces
 */
export class AgentService {
  private engines: Map<string, AgentEngine> = new Map();

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
      const conversation = await AgentConversationOperations.createConversation(
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
    conversation: AgentConversation | null;
    status: AgentStatus;
    progress: {
      currentTasks: number;
      completedTasks: number;
      totalIterations: number;
      currentFocus: string;
    };
    hasResult: boolean;
    result?: any;
  }> {
    try {
      const conversation = await AgentConversationOperations.getConversationById(conversationId);
      if (!conversation) {
        return {
          conversation: null,
          status: AgentStatus.FAILED,
          progress: {
            currentTasks: 0,
            completedTasks: 0,
            totalIterations: 0,
            currentFocus: "Conversation not found",
          },
          hasResult: false,
        };
      }
      
      // Check completion using new task_progress structure
      const hasCharacterData = !!conversation.task_progress.character_data;
      const hasWorldbookData = !!conversation.task_progress.worldbook_data && conversation.task_progress.worldbook_data.length > 0;
      const hasResult = hasCharacterData && hasWorldbookData;
      
      return {
        conversation,
        status: conversation.status,
        progress: {
          currentTasks: conversation.planning_context.current_tasks.length,
          completedTasks: conversation.planning_context.completed_tasks.length,
          totalIterations: conversation.execution_metadata.current_iteration,
          currentFocus: conversation.planning_context.context.current_focus,
        },
        hasResult,
        result: hasResult ? {
          character_data: conversation.task_progress.character_data,
          worldbook_data: conversation.task_progress.worldbook_data,
          integration_notes: conversation.task_progress.integration_notes,
          quality_metrics: conversation.task_progress.quality_metrics,
        } : undefined,
      };
      
    } catch (error) {
      console.error("Failed to get conversation status:", error);
      return {
        conversation: null,
        status: AgentStatus.FAILED,
        progress: {
          currentTasks: 0,
          completedTasks: 0,
          totalIterations: 0,
          currentFocus: "Error occurred",
        },
        hasResult: false,
      };
    }
  }

  /**
   * List all conversations for a user
   */
  async listConversations(): Promise<AgentConversation[]> {
    try {
      return await AgentConversationOperations.getAllConversations();
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
      await AgentConversationOperations.deleteConversation(conversationId);
      return true;
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      return false;
    }
  }

  /**
   * Get conversation messages for UI display
   */
  async getConversationMessages(conversationId: string): Promise<{
    messages: any[];
    messageCount: number;
    lastActivity: string;
  }> {
    try {
      const conversation = await AgentConversationOperations.getConversationById(conversationId);
      if (!conversation) {
        return {
          messages: [],
          messageCount: 0,
          lastActivity: "",
        };
      }
      
      return {
        messages: conversation.messages,
        messageCount: conversation.messages.length,
        lastActivity: conversation.execution_metadata.last_activity,
      };
      
    } catch (error) {
      console.error("Failed to get conversation messages:", error);
      return {
        messages: [],
        messageCount: 0,
        lastActivity: "",
      };
    }
  }

  /**
   * Get planning status for debugging
   */
  async getPlanningStatus(conversationId: string): Promise<{
    goals: any[];
    currentTasks: any[];
    completedTasks: any[];
    context: any;
    stats: any;
  }> {
    try {
      const conversation = await AgentConversationOperations.getConversationById(conversationId);
      if (!conversation) {
        return {
          goals: [],
          currentTasks: [],
          completedTasks: [],
          context: {},
          stats: {},
        };
      }
      
      // Get planning statistics
      const stats = await PlanningOperations.getPlanningStats(conversationId);
      
      return {
        goals: conversation.planning_context.goals,
        currentTasks: conversation.planning_context.current_tasks,
        completedTasks: conversation.planning_context.completed_tasks,
        context: conversation.planning_context.context,
        stats,
      };
      
    } catch (error) {
      console.error("Failed to get planning status:", error);
      return {
        goals: [],
        currentTasks: [],
        completedTasks: [],
        context: {},
        stats: {},
      };
    }
  }

  /**
   * Get task progress for UI display
   */
  async getTaskProgress(conversationId: string): Promise<{
    hasCharacter: boolean;
    hasWorldbook: boolean;
    completionPercentage: number;
    characterData?: any;
    worldbookData?: any[];
    qualityMetrics?: any;
    generationMetadata: any;
  }> {
    try {
      const conversation = await AgentConversationOperations.getConversationById(conversationId);
      if (!conversation) {
        return {
          hasCharacter: false,
          hasWorldbook: false,
          completionPercentage: 0,
          generationMetadata: {
            total_iterations: 0,
            tools_used: [],
            last_updated: "",
          },
        };
      }
      
      const hasCharacter = !!conversation.task_progress.character_data;
      const hasWorldbook = !!conversation.task_progress.worldbook_data && conversation.task_progress.worldbook_data.length > 0;
      
      let completionPercentage = 0;
      if (hasCharacter && hasWorldbook) {
        completionPercentage = 100;
      } else if (hasCharacter || hasWorldbook) {
        completionPercentage = 50;
      }
      
      return {
        hasCharacter,
        hasWorldbook,
        completionPercentage,
        characterData: conversation.task_progress.character_data,
        worldbookData: conversation.task_progress.worldbook_data,
        qualityMetrics: conversation.task_progress.quality_metrics,
        generationMetadata: conversation.task_progress.generation_metadata,
      };
      
    } catch (error) {
      console.error("Failed to get task progress:", error);
      return {
        hasCharacter: false,
        hasWorldbook: false,
        completionPercentage: 0,
        generationMetadata: {
          total_iterations: 0,
          tools_used: [],
          last_updated: "",
        },
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
      const conversation = await AgentConversationOperations.getConversationById(conversationId);
      if (!conversation) {
        return {
          success: false,
          error: "Conversation not found",
        };
      }
      
      const exportData = {
        conversation,
        exportedAt: new Date().toISOString(),
        version: "3.0", // Updated architecture version
        architecture: "clear-context",
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
    toolUsageStats: Record<string, number>;
    averageQualityScore: number;
  }> {
    try {
      const conversations = await AgentConversationOperations.getAllConversations();
      
      const statusBreakdown: Record<string, number> = {};
      const toolUsageStats: Record<string, number> = {};
      let totalIterations = 0;
      let completedGenerations = 0;
      let totalQualityScore = 0;
      let qualityScoreCount = 0;
      
      conversations.forEach(conv => {
        // Count by status
        statusBreakdown[conv.status] = (statusBreakdown[conv.status] || 0) + 1;
        
        // Count iterations
        totalIterations += conv.execution_metadata.current_iteration;
        
        // Count tool usage
        conv.task_progress.generation_metadata.tools_used.forEach(tool => {
          toolUsageStats[tool] = (toolUsageStats[tool] || 0) + 1;
        });
        
        // Count completed generations
        if (conv.status === AgentStatus.COMPLETED && 
            conv.task_progress.character_data && 
            conv.task_progress.worldbook_data && 
            conv.task_progress.worldbook_data.length > 0) {
          completedGenerations++;
        }
        
        // Quality metrics
        if (conv.task_progress.quality_metrics?.completeness) {
          totalQualityScore += conv.task_progress.quality_metrics.completeness;
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
      
      return {
        totalConversations: conversations.length,
        completedGenerations,
        successRate,
        averageIterations,
        statusBreakdown,
        toolUsageStats,
        averageQualityScore,
      };
      
    } catch (error) {
      console.error("Failed to get generation stats:", error);
      return {
        totalConversations: 0,
        completedGenerations: 0,
        successRate: 0,
        averageIterations: 0,
        statusBreakdown: {},
        toolUsageStats: {},
        averageQualityScore: 0,
      };
    }
  }

  /**
   * Get conversation summary for quick display
   */
  async getConversationSummary(conversationId: string): Promise<{
    title: string;
    status: AgentStatus;
    messageCount: number;
    hasCharacter: boolean;
    hasWorldbook: boolean;
    lastActivity: string;
    completionPercentage: number;
  } | null> {
    try {
      return await AgentConversationOperations.getConversationSummary(conversationId);
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
 
