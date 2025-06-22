import { AgentConversationOperations } from "./agent-conversation-operations";
import { ThoughtEntry, DecisionEntry } from "../../models/agent-model";
import { v4 as uuidv4 } from "uuid";

/**
 * Thought Buffer Operations
 */
export class ThoughtBufferOperations {
  /**
   * Add a thought entry to the buffer
   */
  static async addThought(
    conversationId: string, 
    thought: Omit<ThoughtEntry, "id" | "timestamp">,
  ): Promise<void> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    
    const newThought: ThoughtEntry = {
      ...thought,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
    };
    
    conversation.thought_buffer.thoughts.push(newThought);
    await AgentConversationOperations.updateConversation(conversation);
  }

  /**
   * Update the current reasoning
   */
  static async updateReasoning(conversationId: string, reasoning: string): Promise<void> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    
    conversation.thought_buffer.current_reasoning = reasoning;
    await AgentConversationOperations.updateConversation(conversation);
  }

  /**
   * Add a decision to the history
   */
  static async addDecision(
    conversationId: string, 
    decision: Omit<DecisionEntry, "id" | "timestamp">,
  ): Promise<void> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    
    const newDecision: DecisionEntry = {
      ...decision,
      id: uuidv4(),
      timestamp: new Date().toISOString(),
    };
    
    conversation.thought_buffer.decision_history.push(newDecision);
    await AgentConversationOperations.updateConversation(conversation);
  }

  /**
   * Add a reflection note
   */
  static async addReflection(conversationId: string, reflection: string): Promise<void> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    
    conversation.thought_buffer.reflection_notes.push(reflection);
    await AgentConversationOperations.updateConversation(conversation);
  }
} 
