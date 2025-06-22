import { AgentConversationOperations } from "./agent-conversation-operations";
import { PlanTask, GoalNode, PlanPool } from "../../models/agent-model";
import { v4 as uuidv4 } from "uuid";

/**
 * Plan Pool Operations
 */
export class PlanPoolOperations {
  /**
   * Add task to plan pool
   */
  static async addTask(conversationId: string, task: Omit<PlanTask, "id" | "created_at">): Promise<PlanTask> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const newTask: PlanTask = {
      ...task,
      id: uuidv4(),
      created_at: new Date().toISOString(),
    };

    conversation.plan_pool.current_tasks.push(newTask);
    await AgentConversationOperations.updateConversation(conversation);
    
    return newTask;
  }

  /**
   * Update task status and result
   */
  static async updateTask(
    conversationId: string, 
    taskId: string, 
    updates: Partial<PlanTask>,
  ): Promise<void> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const taskIndex = conversation.plan_pool.current_tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Update the task
    Object.assign(conversation.plan_pool.current_tasks[taskIndex], updates);

    // If task is completed or failed, move it to completed_tasks
    if (updates.status === "completed" || updates.status === "failed") {
      const completedTask = conversation.plan_pool.current_tasks[taskIndex];
      completedTask.completed_at = new Date().toISOString();
      conversation.plan_pool.completed_tasks.push(completedTask);
      conversation.plan_pool.current_tasks.splice(taskIndex, 1);

      // Record failure history for failed tasks
      if (updates.status === "failed") {
        const toolName = completedTask.tool;
        const failureHistory = conversation.plan_pool.context.failure_history;
        
        // Increment failure count for this tool
        failureHistory.failed_tool_attempts[toolName] = (failureHistory.failed_tool_attempts[toolName] || 0) + 1;
        
        // Add to recent failures (keep only last 10)
        failureHistory.recent_failures.push({
          tool: toolName,
          description: completedTask.description,
          error: (updates.result as any)?.error || "Unknown error",
          timestamp: completedTask.completed_at!,
          attempt_count: failureHistory.failed_tool_attempts[toolName],
        });
        
        // Keep only the 10 most recent failures
        if (failureHistory.recent_failures.length > 10) {
          failureHistory.recent_failures = failureHistory.recent_failures.slice(-10);
        }
      }
    }

    await AgentConversationOperations.updateConversation(conversation);
  }

  /**
   * Add a new goal to the goal tree
   */
  static async addGoal(conversationId: string, goal: Omit<GoalNode, "id">): Promise<GoalNode> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const newGoal: GoalNode = {
      ...goal,
      id: uuidv4(),
    };

    // For simplicity, adding as a root goal. A more complex implementation
    // would find the correct parent.
    conversation.plan_pool.goal_tree.push(newGoal);
    await AgentConversationOperations.updateConversation(conversation);
    
    return newGoal;
  }

  /**
   * Update a goal in the goal tree
   */
  static async updateGoal(
    conversationId: string, 
    goalId: string, 
    updates: Partial<GoalNode>,
  ): Promise<void> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const findAndApplyUpdate = (nodes: GoalNode[]) => {
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === goalId) {
          Object.assign(nodes[i], updates);
          return true;
        }
      }
      return false;
    };

    if (!findAndApplyUpdate(conversation.plan_pool.goal_tree)) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    await AgentConversationOperations.updateConversation(conversation);
  }

  /**
   * Get tasks that are ready for execution
   */
  static async getReadyTasks(conversationId: string): Promise<PlanTask[]> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Simple logic: return all pending tasks that have no dependencies
    // or whose dependencies are met.
    return conversation.plan_pool.current_tasks.filter(task => 
      task.status === "pending" && 
      (task.dependencies.length === 0 || 
       task.dependencies.every(depId => 
         conversation.plan_pool.completed_tasks.some(ct => ct.id === depId),
       )),
    );
  }
  
  /**
   * Update plan context
   */
  static async updatePlanContext(
    conversationId: string, 
    contextUpdates: Partial<PlanPool["context"]>,
  ): Promise<void> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    
    Object.assign(conversation.plan_pool.context, contextUpdates);
    
    await AgentConversationOperations.updateConversation(conversation);
  }
} 
 
