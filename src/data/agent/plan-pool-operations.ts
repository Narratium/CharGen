import { AgentConversationOperations } from "./agent-conversation-operations";
import { PlanTask, Goal, PlanningContext } from "../../models/agent-model";
import { v4 as uuidv4 } from "uuid";

/**
 * Planning Operations - Redesigned
 * Handles planning-specific data operations with clear interfaces
 */
export class PlanningOperations {
  /**
   * Add task to planning context
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

    conversation.planning_context.current_tasks.push(newTask);
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

    const taskIndex = conversation.planning_context.current_tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Update the task
    Object.assign(conversation.planning_context.current_tasks[taskIndex], updates);

    // If task is completed or failed, move it to completed_tasks
    if (updates.status === "completed" || updates.status === "failed") {
      const completedTask = conversation.planning_context.current_tasks[taskIndex];
      completedTask.completed_at = new Date().toISOString();
      conversation.planning_context.completed_tasks.push(completedTask);
      conversation.planning_context.current_tasks.splice(taskIndex, 1);

      // Record failure history for failed tasks
      if (updates.status === "failed") {
        const toolName = completedTask.tool;
        const failureHistory = conversation.planning_context.context.failure_history;
        
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
   * Add a new goal to the goal hierarchy
   */
  static async addGoal(conversationId: string, goal: Omit<Goal, "id">): Promise<Goal> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const newGoal: Goal = {
      ...goal,
      id: uuidv4(),
    };

    conversation.planning_context.goals.push(newGoal);
    await AgentConversationOperations.updateConversation(conversation);
    
    return newGoal;
  }

  /**
   * Update a goal in the goal hierarchy
   */
  static async updateGoal(
    conversationId: string, 
    goalId: string, 
    updates: Partial<Goal>,
  ): Promise<void> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const goalIndex = conversation.planning_context.goals.findIndex(g => g.id === goalId);
    if (goalIndex === -1) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    Object.assign(conversation.planning_context.goals[goalIndex], updates);
    await AgentConversationOperations.updateConversation(conversation);
  }

  /**
   * Get tasks that are ready for execution
   * Returns tasks with highest priority first
   */
  static async getReadyTasks(conversationId: string): Promise<PlanTask[]> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Get pending tasks that have no dependencies or whose dependencies are met
    const readyTasks = conversation.planning_context.current_tasks.filter(task => 
      task.status === "pending" && 
      (task.dependencies.length === 0 || 
       task.dependencies.every(depId => 
         conversation.planning_context.completed_tasks.some(ct => ct.id === depId),
       )),
    );

    // Sort by priority (highest first)
    return readyTasks.sort((a, b) => b.priority - a.priority);
  }
  
  /**
   * Update planning context metadata
   */
  static async updatePlanningContext(
    conversationId: string, 
    contextUpdates: Partial<PlanningContext["context"]>,
  ): Promise<void> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }
    
    Object.assign(conversation.planning_context.context, contextUpdates);
    await AgentConversationOperations.updateConversation(conversation);
  }

  /**
   * Remove task from current tasks (mark as obsolete)
   */
  static async removeTask(conversationId: string, taskId: string, reason?: string): Promise<void> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const taskIndex = conversation.planning_context.current_tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Move to completed with obsolete status
    const obsoleteTask = conversation.planning_context.current_tasks[taskIndex];
    obsoleteTask.status = "obsolete" as any;
    obsoleteTask.completed_at = new Date().toISOString();
    if (reason) {
      obsoleteTask.obsolete_reason = reason;
    }

    conversation.planning_context.completed_tasks.push(obsoleteTask);
    conversation.planning_context.current_tasks.splice(taskIndex, 1);

    await AgentConversationOperations.updateConversation(conversation);
  }

  /**
   * Remove multiple tasks by criteria
   */
  static async removeTasksByCriteria(
    conversationId: string, 
    criteria: {
      tool?: string;
      status?: string;
      descriptionContains?: string;
    },
    reason?: string
  ): Promise<number> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const tasksToRemove = conversation.planning_context.current_tasks.filter(task => {
      if (criteria.tool && task.tool !== criteria.tool) return false;
      if (criteria.status && task.status !== criteria.status) return false;
      if (criteria.descriptionContains && !task.description.toLowerCase().includes(criteria.descriptionContains.toLowerCase())) return false;
      return true;
    });

    // Mark tasks as obsolete and move to completed
    for (const task of tasksToRemove) {
      const taskIndex = conversation.planning_context.current_tasks.findIndex(t => t.id === task.id);
      if (taskIndex !== -1) {
        task.status = "obsolete" as any;
        task.completed_at = new Date().toISOString();
        if (reason) {
          task.obsolete_reason = reason;
        }
        
        conversation.planning_context.completed_tasks.push(task);
        conversation.planning_context.current_tasks.splice(taskIndex, 1);
      }
    }

    await AgentConversationOperations.updateConversation(conversation);
    return tasksToRemove.length;
  }

  /**
   * Clear all pending tasks (useful for complete replan)
   */
  static async clearPendingTasks(conversationId: string, reason: string = "Complete replan triggered"): Promise<number> {
    return await this.removeTasksByCriteria(conversationId, { status: "pending" }, reason);
  }

  /**
   * Remove goal from goal hierarchy
   */
  static async removeGoal(conversationId: string, goalId: string): Promise<void> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const goalIndex = conversation.planning_context.goals.findIndex(g => g.id === goalId);
    if (goalIndex === -1) {
      throw new Error(`Goal not found: ${goalId}`);
    }

    conversation.planning_context.goals.splice(goalIndex, 1);
    await AgentConversationOperations.updateConversation(conversation);
  }

  /**
   * Get current task summary for analysis
   */
  static async getTaskSummary(conversationId: string): Promise<{
    pending: number;
    executing: number;
    total_current: number;
    by_tool: Record<string, number>;
  }> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const tasks = conversation.planning_context.current_tasks;
    const byTool: Record<string, number> = {};

    for (const task of tasks) {
      byTool[task.tool] = (byTool[task.tool] || 0) + 1;
    }

    return {
      pending: tasks.filter(t => t.status === "pending").length,
      executing: tasks.filter(t => t.status === "executing").length,
      total_current: tasks.length,
      by_tool: byTool,
    };
  }

  /**
   * Get current planning context
   */
  static async getPlanningContext(conversationId: string): Promise<PlanningContext> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    return conversation.planning_context;
  }

  /**
   * Get current goal tree
   */
  static async getGoals(conversationId: string): Promise<Goal[]> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    return conversation.planning_context.goals;
  }

  /**
   * Get planning statistics for monitoring
   */
  static async getPlanningStats(conversationId: string): Promise<{
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    obsoleteTasks: number;
    totalGoals: number;
    completedGoals: number;
    mostUsedTool: string | null;
    failureRate: number;
  }> {
    const conversation = await AgentConversationOperations.getConversationById(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const currentTasks = conversation.planning_context.current_tasks;
    const completedTasks = conversation.planning_context.completed_tasks;
    const allTasks = [...currentTasks, ...completedTasks];
    const goals = conversation.planning_context.goals;

    // Count tasks by status
    const completedCount = completedTasks.filter(t => t.status === "completed").length;
    const failedCount = completedTasks.filter(t => t.status === "failed").length;
    const obsoleteCount = completedTasks.filter(t => t.status === "obsolete").length;

    // Count goals by status
    const completedGoalsCount = goals.filter(g => g.status === "completed").length;

    // Find most used tool
    const toolUsage: Record<string, number> = {};
    for (const task of allTasks) {
      toolUsage[task.tool] = (toolUsage[task.tool] || 0) + 1;
    }
    const mostUsedTool = Object.keys(toolUsage).length > 0 
      ? Object.entries(toolUsage).sort(([,a], [,b]) => b - a)[0][0] 
      : null;

    // Calculate failure rate
    const totalExecutedTasks = completedCount + failedCount;
    const failureRate = totalExecutedTasks > 0 ? failedCount / totalExecutedTasks : 0;

    return {
      totalTasks: allTasks.length,
      completedTasks: completedCount,
      failedTasks: failedCount,
      obsoleteTasks: obsoleteCount,
      totalGoals: goals.length,
      completedGoals: completedGoalsCount,
      mostUsedTool,
      failureRate,
    };
  }
}

// Backward compatibility alias
export { PlanningOperations as PlanPoolOperations }; 
 
