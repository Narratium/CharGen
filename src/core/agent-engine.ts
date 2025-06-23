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

    while (iteration < maxIterations) {
      iteration++;
      conversation.context.current_iteration = iteration;

      // Get ready tasks
      const readyTasks = await PlanPoolOperations.getReadyTasks(this.conversationId);
      
      if (readyTasks.length === 0) {
        // No ready tasks - check if we need to plan more or if we're done
        const shouldContinue = await this.evaluateCompletion();
        if (!shouldContinue) break;
        
        // Create a replanning task
        await this.createReplanningTask();
        continue;
      }

      // Execute highest priority task
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

        await ThoughtBufferOperations.addThought(this.conversationId, {
          type: "observation",
          content: `User provided: ${userInput}`,
        });

        // Analyze if user input requires complete replan
        const needsCompleteReplan = await this.analyzeUserInputForReplan(userInput);
        if (needsCompleteReplan) {
          await this.createCompleteReplanTask(userInput);
        }

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

    await ThoughtBufferOperations.addThought(this.conversationId, {
      type: "decision",
      content: `User input analysis: changeIndicator=${hasChangeIndicator}, substantiallyNew=${isSubstantiallyNew}, needsReplan=${hasChangeIndicator || isSubstantiallyNew}`,
    });

    return hasChangeIndicator || isSubstantiallyNew;
  }

  /**
   * Create a complete replan task when user input indicates major changes needed
   */
  private async createCompleteReplanTask(userInput: string): Promise<void> {
    await PlanPoolOperations.addTask(this.conversationId, {
      description: `Complete replan based on new user requirements: ${userInput.substring(0, 100)}...`,
      tool: ToolType.PLAN,
      parameters: { 
        type: "complete_replan",
        trigger_input: userInput
      },
      dependencies: [],
      status: "pending",
      priority: 10, // Highest priority - should execute immediately
      reasoning: "User input indicates significant changes to requirements, need to remove obsolete tasks and create new plan",
    });

    await ThoughtBufferOperations.addDecision(this.conversationId, {
      decision: "Triggered complete replan",
      reasoning: `User input indicated major changes: "${userInput.substring(0, 200)}..."`,
      alternatives_considered: ["Simple replan", "Continue with current plan"],
      confidence: 0.8,
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
 
