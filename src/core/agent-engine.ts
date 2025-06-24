import {
  AgentStatus,
  PlanTask,
  ToolType,
  BaseToolContext,
  PlanToolContext,
  ToolExecutionResult,
} from "../models/agent-model";
import { AgentConversationOperations } from "../data/agent/agent-conversation-operations";
import { PlanningOperations } from "../data/agent/plan-pool-operations";
import { ToolRegistry } from "../tools/tool-registry";

// Define user input callback type
type UserInputCallback = (message?: string) => Promise<string>;

/**
 * Agent Engine - Redesigned with Clear Context Architecture
 * Uses the new context system with proper separation of concerns
 */
export class AgentEngine {
  private conversationId: string;
  private userInputCallback?: UserInputCallback;

  constructor(conversationId: string, userInputCallback?: UserInputCallback) {
    this.conversationId = conversationId;
    this.userInputCallback = userInputCallback;
  }

  /**
   * Start the agent execution with user input callback
   */
  async start(userInputCallback?: UserInputCallback): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }> {
    try {
      // Set user input callback if provided
      if (userInputCallback) {
        this.userInputCallback = userInputCallback;
      }

      await AgentConversationOperations.updateStatus(this.conversationId, AgentStatus.THINKING);
      
      // Create initial planning task
      await this.createInitialPlanningTask();
      
      // Main execution loop
      return await this.executionLoop();
      
    } catch (error) { 
      await AgentConversationOperations.updateStatus(this.conversationId, AgentStatus.FAILED);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Create initial planning task
   */
  private async createInitialPlanningTask(): Promise<void> {
    await PlanningOperations.addTask(this.conversationId, {
      description: "Create initial execution plan",
      tool: ToolType.PLAN,
      status: "pending",
      priority: 10, // Highest priority
      reasoning: "Need to create an execution plan before starting",
    });
  }

  /**
   * Main execution loop with clean context management
   */
  private async executionLoop(): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }> {
    const conversation = await AgentConversationOperations.getConversationById(this.conversationId);
    if (!conversation) throw new Error("Conversation not found");

    let iteration = 0;
    const maxIterations = conversation.execution_metadata.max_iterations;

    while (iteration < maxIterations) {
      iteration++;
      await AgentConversationOperations.incrementIteration(this.conversationId);

      // Get ready tasks
      const readyTasks = await PlanningOperations.getReadyTasks(this.conversationId);
      
      if (readyTasks.length === 0) {
        // No ready tasks - check if we need to plan more or if we're done
        const shouldContinue = await this.evaluateCompletion();
        if (!shouldContinue) break;
        
        // Create a replanning task
        await this.createReplanningTask();
        continue;
      }

      // Execute highest priority task (already sorted by priority)
      const task = readyTasks[0];
      const result = await this.executeTask(task);

      // Handle user input requirement within the same loop
      if (result.user_input_required) {
        
        if (!this.userInputCallback) {
          throw new Error("User input required but no callback provided");
        }

        // Get user input using callback - stays in same loop
        await AgentConversationOperations.updateStatus(this.conversationId, AgentStatus.WAITING_USER);
        
        const userInput = await this.userInputCallback(result.result?.message || "I need more information from you.");
        
        // Add user input to conversation and continue in same iteration
        await AgentConversationOperations.addMessage(this.conversationId, {
          role: "user",
          content: userInput,
          message_type: "user_input",
        });
        
        await AgentConversationOperations.updateStatus(this.conversationId, AgentStatus.THINKING);
        continue;
      }

      if (result.should_update_plan) {
        await this.createReplanningTask();
      }

      if (!result.should_continue) {
        break;
      }

      // Add small delay to prevent tight loops
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Check if task is completed
    const finalResult = await this.checkCompletion();
    if (finalResult.completed) {
      await AgentConversationOperations.updateStatus(this.conversationId, AgentStatus.COMPLETED);
      return {
        success: true,
        result: finalResult.data,
      };
    } else {
      return {
        success: false,
        error: "Maximum iterations reached without completion",
      };
    }
  }

  /**
   * Execute a single task using the new context system
   */
  private async executeTask(task: PlanTask): Promise<ToolExecutionResult> {
    await AgentConversationOperations.updateStatus(this.conversationId, AgentStatus.EXECUTING);
    
    // Update task status
    await PlanningOperations.updateTask(this.conversationId, task.id, {
      status: "executing",
    });

    // Record tool usage
    await AgentConversationOperations.recordToolUsage(this.conversationId, task.tool);

    // Add execution message
    await AgentConversationOperations.addMessage(this.conversationId, {
      role: "agent",
      content: `Executing: ${task.description}`,
      message_type: "agent_action",
      metadata: {
        task_id: task.id,
        tool_used: task.tool,
        reasoning: task.reasoning,
      },
    });

    try {
      const conversation = await AgentConversationOperations.getConversationById(this.conversationId);
      if (!conversation) throw new Error("Conversation not found");

      // Build appropriate context based on tool type
      let context: BaseToolContext | PlanToolContext;

      if (task.tool === ToolType.PLAN) {
        // PLAN tools get extended context with planning information
        context = {
          conversation_id: this.conversationId,
          task_progress: conversation.task_progress,
          conversation_history: conversation.messages,
          llm_config: conversation.llm_config,
          planning_context: conversation.planning_context,
        } as PlanToolContext;
      } else {
        // Regular tools get minimal context
        context = {
          conversation_id: this.conversationId,
          task_progress: conversation.task_progress,
          conversation_history: conversation.messages,
          llm_config: conversation.llm_config,
        } as BaseToolContext;
      }

      // Use the tool registry with appropriate context
      const result = await ToolRegistry.executeTask(task, context);

      if (result.success) {
        await PlanningOperations.updateTask(this.conversationId, task.id, {
          status: "completed",
          result: result.result,
        });
      } else {
        await PlanningOperations.updateTask(this.conversationId, task.id, {
          status: "failed",
          result: { error: result.error },
        });
      }

      return result;

    } catch (error) {
      console.error("Task execution failed:", error);
      
      await PlanningOperations.updateTask(this.conversationId, task.id, {
        status: "failed",
        result: { error: error instanceof Error ? error.message : "Unknown error" },
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        should_continue: true,
      };
    }
  }

  /**
   * Create a replanning task
   */
  private async createReplanningTask(): Promise<void> {
    await PlanningOperations.addTask(this.conversationId, {
      description: "Evaluate progress and update execution plan",
      tool: ToolType.PLAN,
      status: "pending",
      priority: 9, // High priority
      reasoning: "Need to update plan based on current progress",
    });
  }

  /**
   * Check if the task is completed
   */
  private async checkCompletion(): Promise<{ completed: boolean; data?: any }> {
    const conversation = await AgentConversationOperations.getConversationById(this.conversationId);
    if (!conversation) return { completed: false };

    const hasCharacterData = !!conversation.task_progress.character_data;
    const hasWorldbookData = !!conversation.task_progress.worldbook_data && conversation.task_progress.worldbook_data.length > 0;

    if (hasCharacterData && hasWorldbookData) {
      return {
        completed: true,
        data: {
          character_data: conversation.task_progress.character_data,
          worldbook_data: conversation.task_progress.worldbook_data,
          integration_notes: conversation.task_progress.integration_notes,
          quality_metrics: conversation.task_progress.quality_metrics,
        },
      };
    }

    return { completed: false };
  }

  /**
   * Evaluate if execution should continue
   */
  private async evaluateCompletion(): Promise<boolean> {
    const conversation = await AgentConversationOperations.getConversationById(this.conversationId);
    if (!conversation) return false;

    // Check if main goal is completed
    const mainGoal = conversation.planning_context.goals.find(g => g.type === "main_goal");
    if (mainGoal?.status === "completed") return false;

    // Check completion status first
    const completion = await this.checkCompletion();
    if (completion.completed) return false;

    // Check if we have any pending tasks
    const hasPendingTasks = conversation.planning_context.current_tasks.some(t => t.status === "pending");
    if (hasPendingTasks) return true;

    // Check failure patterns - if all tools have failed too many times, consider stopping
    const failureHistory = conversation.planning_context.context.failure_history;
    const criticalFailures = Object.entries(failureHistory.failed_tool_attempts)
      .filter(([tool, count]) => count >= 5); // Tool failed 5+ times

    if (criticalFailures.length >= 2) {
      // Still continue but add a warning task
      await PlanningOperations.addTask(this.conversationId, {
        description: "Review and resolve repeated tool failures before continuing",
        tool: ToolType.PLAN,
        status: "pending",
        priority: 10,
        reasoning: "Multiple tools have failed repeatedly, need to reassess strategy",
      });
    }

    return true;
  }

  /**
   * Analyze user input to determine if complete replan is needed
   */
  private async analyzeUserInputForReplan(userInput: string): Promise<boolean> {
    // Simple heuristic analysis for now
    const changeIndicators = [
      // Direct change requests
      "change", "different", "instead", "modify", "alter", "switch",
      // Requirement changes  
      "actually", "no wait", "forget that", "never mind", "let me",
      // New directions
      "new", "fresh", "start over", "completely different",
      // Negative feedback
      "not what", "wrong", "don't want", "not like", "hate"
    ];

    const userInputLower = userInput.toLowerCase();
    const hasChangeIndicator = changeIndicators.some(indicator => 
      userInputLower.includes(indicator)
    );

    // Also check if user is providing substantially new information
    const conversation = await AgentConversationOperations.getConversationById(this.conversationId);
    if (!conversation) return false;

    const previousUserMessages = conversation.messages
      .filter(msg => msg.role === "user")
      .slice(-5) // Last 5 user messages
      .map(msg => msg.content);

    // If this is a significant departure from previous messages, trigger replan
    const isSubstantiallyNew = userInput.length > 50 && 
      !previousUserMessages.some(prevMsg => 
        this.calculateSimilarity(userInput, prevMsg) > 0.6
      );

    return hasChangeIndicator || isSubstantiallyNew;
  }

  /**
   * Create a complete replan task when user input indicates major changes needed
   */
  private async createCompleteReplanTask(userInput: string): Promise<void> {
    await PlanningOperations.addTask(this.conversationId, {
      description: `Complete replan based on new user requirements: ${userInput.substring(0, 100)}...`,
      tool: ToolType.PLAN,
      status: "pending",
      priority: 10, // Highest priority - should execute immediately
      reasoning: "User input indicates significant changes to requirements, need to remove obsolete tasks and create new plan",
    });
  }

  /**
   * Simple text similarity calculation
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    
    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = Math.max(words1.length, words2.length);
    
    return totalWords > 0 ? commonWords.length / totalWords : 0;
  }
} 
 
