import { AgentEngine } from "./agent-engine";
import { AgentConversationOperations } from "../data/agent/agent-conversation-operations";
import { AgentConversation, AgentStatus } from "../models/agent-model";

// Define user input callback type
type UserInputCallback = (message?: string) => Promise<string>;

/**
 * Agent Service - High-level API for character+worldbook generation
 * Simplified architecture with plan-based execution
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
      // Create new conversation with proper LLM config format
      const conversation = await AgentConversationOperations.createConversation(
        title, 
        userRequest, 
        {
          model_name: llmConfig.model_name,
          api_key: llmConfig.api_key,
          base_url: llmConfig.base_url,
          llm_type: llmConfig.llm_type,
          temperature: llmConfig.temperature || 0.7,
          max_tokens: llmConfig.max_tokens,
        },
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
   * Get conversation status and progress
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
      
      const hasCharacterData = !!conversation.result.character_data;
      const hasWorldbookData = !!conversation.result.worldbook_data && conversation.result.worldbook_data.length > 0;
      const hasResult = hasCharacterData && hasWorldbookData;
      
      return {
        conversation,
        status: conversation.status,
        progress: {
          currentTasks: conversation.plan_pool.current_tasks.length,
          completedTasks: conversation.plan_pool.completed_tasks.length,
          totalIterations: conversation.context.current_iteration,
          currentFocus: conversation.plan_pool.context.current_focus,
        },
        hasResult,
        result: hasResult ? {
          character_data: conversation.result.character_data,
          worldbook_data: conversation.result.worldbook_data,
          integration_notes: conversation.result.integration_notes,
          quality_metrics: conversation.result.quality_metrics,
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
      return await AgentConversationOperations.deleteConversation(conversationId);
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
    thoughts: any[];
    currentReasoning: string;
  }> {
    try {
      const conversation = await AgentConversationOperations.getConversationById(conversationId);
      if (!conversation) {
        return {
          messages: [],
          thoughts: [],
          currentReasoning: "",
        };
      }
      
      return {
        messages: conversation.messages,
        thoughts: conversation.thought_buffer.thoughts,
        currentReasoning: conversation.thought_buffer.current_reasoning,
      };
      
    } catch (error) {
      console.error("Failed to get conversation messages:", error);
      return {
        messages: [],
        thoughts: [],
        currentReasoning: "",
      };
    }
  }

  /**
   * Get plan status for debugging
   */
  async getPlanStatus(conversationId: string): Promise<{
    goalTree: any[];
    currentTasks: any[];
    completedTasks: any[];
    context: any;
  }> {
    try {
      const conversation = await AgentConversationOperations.getConversationById(conversationId);
      if (!conversation) {
        return {
          goalTree: [],
          currentTasks: [],
          completedTasks: [],
          context: {},
        };
      }
      
      return {
        goalTree: conversation.plan_pool.goal_tree,
        currentTasks: conversation.plan_pool.current_tasks,
        completedTasks: conversation.plan_pool.completed_tasks,
        context: conversation.plan_pool.context,
      };
      
    } catch (error) {
      console.error("Failed to get plan status:", error);
      return {
        goalTree: [],
        currentTasks: [],
        completedTasks: [],
        context: {},
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
        version: "2.0", // New architecture version
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
   * Get generation statistics
   */
  async getGenerationStats(): Promise<{
    totalConversations: number;
    completedGenerations: number;
    successRate: number;
    averageIterations: number;
    statusBreakdown: Record<string, number>;
  }> {
    try {
      const conversations = await AgentConversationOperations.getAllConversations();
      
      const statusBreakdown: Record<string, number> = {};
      let totalIterations = 0;
      let completedGenerations = 0;
      
      conversations.forEach(conv => {
        // Count by status
        statusBreakdown[conv.status] = (statusBreakdown[conv.status] || 0) + 1;
        
        // Count iterations
        totalIterations += conv.context.current_iteration;
        
        // Count completed generations
        if (conv.status === AgentStatus.COMPLETED && 
            conv.result.character_data && 
            conv.result.worldbook_data && 
            conv.result.worldbook_data.length > 0) {
          completedGenerations++;
        }
      });
      
      const successRate = conversations.length > 0 
        ? (completedGenerations / conversations.length) * 100 
        : 0;
        
      const averageIterations = conversations.length > 0 
        ? totalIterations / conversations.length 
        : 0;
      
      return {
        totalConversations: conversations.length,
        completedGenerations,
        successRate,
        averageIterations,
        statusBreakdown,
      };
      
    } catch (error) {
      console.error("Failed to get generation stats:", error);
      return {
        totalConversations: 0,
        completedGenerations: 0,
        successRate: 0,
        averageIterations: 0,
        statusBreakdown: {},
      };
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
 
