import {
  AgentStatus,
  PlanTask,
  ToolType,
  ToolExecutionContext,
  ToolExecutionResult,
} from "../models/agent-model";
import { AgentConversationOperations } from "../data/agent/agent-conversation-operations";
import { PlanPoolOperations } from "../data/agent/plan-pool-operations";
import { ResultOperations } from "../data/agent/result-operations";
import { ThoughtBufferOperations } from "../data/agent/thought-buffer-operations";
import { ToolRegistry } from "../tools/tool-registry";

// Define user input callback type
type UserInputCallback = (message?: string) => Promise<string>;

/**
 * Main Agent Engine - Plan-based Architecture
 * LLM acts as the central planner that creates and manages tasks
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

      console.log("🚀 [Agent Engine] Starting agent execution...");
      await AgentConversationOperations.updateStatus(this.conversationId, AgentStatus.THINKING);
      
      // Create initial planning task
      console.log("📋 [Agent Engine] Creating initial planning task...");
      await this.createInitialPlanningTask();
      
      // Main execution loop
      console.log("🔄 [Agent Engine] Entering main execution loop...");
      return await this.executionLoop();
      
    } catch (error) {
      console.error("❌ [Agent Engine] Agent execution failed:", error);
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
    // Add the planning task as the first task
    await PlanPoolOperations.addTask(this.conversationId, {
      description: "Create initial execution plan",
      tool: ToolType.PLAN,
      parameters: { type: "initial" },
      dependencies: [],
      status: "pending",
      priority: 10, // Highest priority
      reasoning: "Need to create an execution plan before starting",
    });
  }

  /**
   * Main execution loop with user input handled inline
   */
  private async executionLoop(): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }> {
    const conversation = await AgentConversationOperations.getConversationById(this.conversationId);
    if (!conversation) throw new Error("Conversation not found");

    let iteration = 0;
    const maxIterations = conversation.context.max_iterations;
    console.log(`🔄 [Execution Loop] Max iterations: ${maxIterations}`);

    while (iteration < maxIterations) {
      iteration++;
      conversation.context.current_iteration = iteration;
      console.log(`\n📍 [Execution Loop] Iteration ${iteration}/${maxIterations}`);

      // Get ready tasks
      const readyTasks = await PlanPoolOperations.getReadyTasks(this.conversationId);
      console.log(`📝 [Execution Loop] Found ${readyTasks.length} ready tasks`);
      
      if (readyTasks.length === 0) {
        console.log("⚠️  [Execution Loop] No ready tasks available");
        // No ready tasks - check if we need to plan more or if we're done
        const shouldContinue = await this.evaluateCompletion();
        console.log(`🤔 [Execution Loop] Should continue: ${shouldContinue}`);
        if (!shouldContinue) break;
        
        // Create a replanning task
        console.log("🔄 [Execution Loop] Creating replanning task...");
        await this.createReplanningTask();
        continue;
      }

      // Execute highest priority task
      const task = readyTasks[0];
      console.log(`⚡ [Execution Loop] Executing task: ${task.description} (Tool: ${task.tool})`);
      const result = await this.executeTask(task);

      console.log(`✅ [Execution Loop] Task result: Success=${result.success}, UserInput=${result.user_input_required}, Continue=${result.should_continue}`);

      // Handle user input requirement within the same loop
      if (result.user_input_required) {
        console.log("💬 [Execution Loop] User input required within current iteration");
        
        if (!this.userInputCallback) {
          throw new Error("User input required but no callback provided");
        }

        // Get user input using callback - stays in same loop
        console.log("📞 [Execution Loop] Calling user input callback...");
        await AgentConversationOperations.updateStatus(this.conversationId, AgentStatus.WAITING_USER);
        
        const userInput = await this.userInputCallback(result.result?.message || "I need more information from you.");
        
        // Add user input to conversation and continue in same iteration
        await AgentConversationOperations.addMessage(this.conversationId, {
          role: "user",
          content: userInput,
          message_type: "user_input",
        });

        await ThoughtBufferOperations.addThought(this.conversationId, {
          type: "observation",
          content: `User provided: ${userInput}`,
        });

        await AgentConversationOperations.updateStatus(this.conversationId, AgentStatus.THINKING);
        console.log("▶️  [Execution Loop] User input received, continuing in same iteration...");
        
        // Continue with the same iteration - don't increment iteration counter
        iteration--;
        continue;
      }

      if (result.should_update_plan) {
        console.log("🔄 [Execution Loop] Plan update requested");
        await this.createReplanningTask();
      }

      if (!result.should_continue) {
        console.log("🛑 [Execution Loop] Task indicated to stop execution");
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
   * Execute a single task using the unified tool system
   */
  private async executeTask(task: PlanTask): Promise<ToolExecutionResult> {
    await AgentConversationOperations.updateStatus(this.conversationId, AgentStatus.EXECUTING);
    
    // Update task status
    await PlanPoolOperations.updateTask(this.conversationId, task.id, {
      status: "executing",
    });

    // Record tool usage
    await ResultOperations.recordToolUsage(this.conversationId, task.tool);

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

      const context: ToolExecutionContext = {
        conversation_id: this.conversationId,
        plan_pool: conversation.plan_pool,
        thought_buffer: conversation.thought_buffer,
        current_result: conversation.result,
        llm_config: conversation.llm_config,
      };

      // Use the unified tool registry
      const result = await ToolRegistry.executeTask(task, context);

      if (result.success) {
        await PlanPoolOperations.updateTask(this.conversationId, task.id, {
          status: "completed",
          result: result.result,
        });
      } else {
        await PlanPoolOperations.updateTask(this.conversationId, task.id, {
          status: "failed",
          result: { error: result.error },
        });
      }

      return result;

    } catch (error) {
      console.error("Task execution failed:", error);
      
      await PlanPoolOperations.updateTask(this.conversationId, task.id, {
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
    await PlanPoolOperations.addTask(this.conversationId, {
      description: "Evaluate progress and update execution plan",
      tool: ToolType.PLAN,
      parameters: { type: "replan" },
      dependencies: [],
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

    const hasCharacterData = !!conversation.result.character_data;
    const hasWorldbookData = !!conversation.result.worldbook_data && conversation.result.worldbook_data.length > 0;

    if (hasCharacterData && hasWorldbookData) {
      return {
        completed: true,
        data: {
          character_data: conversation.result.character_data,
          worldbook_data: conversation.result.worldbook_data,
          integration_notes: conversation.result.integration_notes,
          quality_metrics: conversation.result.quality_metrics,
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
    const mainGoal = conversation.plan_pool.goal_tree.find(g => g.type === "main_goal");
    if (mainGoal?.status === "completed") return false;

    // Check completion status first
    const completion = await this.checkCompletion();
    if (completion.completed) return false;

    // Check if we have any pending tasks
    const hasPendingTasks = conversation.plan_pool.current_tasks.some(t => t.status === "pending");
    if (hasPendingTasks) return true;

    // Check failure patterns - if all tools have failed too many times, consider stopping
    const failureHistory = conversation.plan_pool.context.failure_history;
    const criticalFailures = Object.entries(failureHistory.failed_tool_attempts)
      .filter(([tool, count]) => count >= 5); // Tool failed 5+ times

    if (criticalFailures.length >= 2) {
      console.log("⚠️  [Evaluation] Multiple tools have failed repeatedly, may need intervention");
      // Still continue but add a warning task
      await PlanPoolOperations.addTask(this.conversationId, {
        description: "Review and resolve repeated tool failures before continuing",
        tool: ToolType.PLAN,
        parameters: { type: "failure_analysis" },
        dependencies: [],
        status: "pending",
        priority: 10,
        reasoning: "Multiple tools have failed repeatedly, need to reassess strategy",
      });
    }

    return true;
  }
} 
 
