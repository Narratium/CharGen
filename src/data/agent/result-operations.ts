import { AgentConversationOperations } from "./agent-conversation-operations";
import { AgentResult, ToolType } from "../../models/agent-model";

/**
 * Result Operations
 */
export class ResultOperations {
  /**
   * Update character data in the result
   */
  static async updateCharacterData(
    conversationId: string, 
    characterData: AgentResult["character_data"],
  ): Promise<void> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    
    conversation.result.character_data = characterData;
    await AgentConversationOperations.updateConversation(conversation);
  }

  /**
   * Update worldbook data in the result
   */
  static async updateWorldbookData(
    conversationId: string, 
    worldbookData: AgentResult["worldbook_data"],
  ): Promise<void> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    
    conversation.result.worldbook_data = worldbookData;
    await AgentConversationOperations.updateConversation(conversation);

  }
  /**
   * Update quality metrics
   */
  static async updateQualityMetrics(
    conversationId: string, 
    metrics: AgentResult["quality_metrics"],
  ): Promise<void> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    
    conversation.result.quality_metrics = metrics;
    await AgentConversationOperations.updateConversation(conversation);
  }

  /**
   * Record a tool usage event
   */
  static async recordToolUsage(conversationId: string, tool: ToolType): Promise<void> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    
    conversation.result.generation_metadata.tools_used.push(tool);
    await AgentConversationOperations.updateConversation(conversation);
  }
} 
