import { BaseTool } from "../base-tool";
import { ToolType, ToolExecutionContext, ToolExecutionResult, PlanTask } from "../../models/agent-model";
import { PlanPoolOperations } from "../../data/agent/plan-pool-operations";
import { ThoughtBufferOperations } from "../../data/agent/thought-buffer-operations";
import { PlanPrompts } from "./prompts";
import { AgentConversationOperations } from "../../data/agent/agent-conversation-operations";

/**
 * Plan Tool - Core planning and replanning functionality
 * This tool is called at the beginning and when replanning is needed
 */
export class PlanTool extends BaseTool {
  readonly toolType = ToolType.PLAN;
  readonly name = "Plan Manager";
  readonly description = "Create initial plans and update execution strategy based on current progress";

  async executeToolLogic(task: PlanTask, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const planType = task.parameters.type || "initial";
    
    if (planType === "initial") {
      return await this.createInitialPlan(task, context);
    } else if (planType === "replan") {
      return await this.updatePlan(task, context);
    } else if (planType === "complete_replan") {
      return await this.completeReplan(task, context);
    } else if (planType === "evaluate") {
      return await this.evaluateProgress(task, context);
    } else if (planType === "failure_analysis") {
      return await this.analyzeFailures(task, context);
    }

    throw new Error(`Unknown plan type: ${planType}`);
  }

  /**
   * Create the initial execution plan
   */
  private async createInitialPlan(task: PlanTask, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    try {
      const planData = await this.generatePlanWithLLM(context, "initial", task);
      
      // Create goal tree
      for (const goal of planData.goals || []) {
        await PlanPoolOperations.addGoal(context.conversation_id, {
          description: goal.description,
          type: goal.type,
          parent_id: goal.parent_id,
          children: [],
          status: "pending",
          metadata: goal.metadata || {},
        });
      }
      
      // Create initial tasks
      for (const taskData of planData.tasks || []) {
        await PlanPoolOperations.addTask(context.conversation_id, {
          description: taskData.description,
          tool: taskData.tool,
          parameters: taskData.parameters || {},
          dependencies: taskData.dependencies || [],
          status: "pending",
          reasoning: taskData.reasoning,
          priority: taskData.priority || 5,
        });
      }

      // Record planning decision
      await ThoughtBufferOperations.addDecision(context.conversation_id, {
        decision: "Created initial execution plan",
        reasoning: planData.reasoning || "Initial planning completed based on user request",
        alternatives_considered: planData.alternatives || [],
        confidence: planData.confidence || 0.8,
      });

      await this.addMessage(
        context.conversation_id,
        "agent",
        `📋 **Initial Plan Created**\n\n**Goals:** ${planData.goals?.length || 0}\n**Tasks:** ${planData.tasks?.length || 0}\n\n${planData.reasoning}`,
        "agent_thinking",
      );

      return {
        success: true,
        result: {
          plan_type: "initial",
          goals_created: planData.goals?.length || 0,
          tasks_created: planData.tasks?.length || 0,
          reasoning: planData.reasoning,
        },
        should_continue: true,
      };

    } catch (error) {
      // Create fallback plan
      await this.createFallbackPlan(context);
      
      return {
        success: true,
        result: { plan_type: "fallback" },
        should_continue: true,
      };
    }
  }

  /**
   * Update the current plan based on progress
   */
  private async updatePlan(task: PlanTask, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    try {
      const planUpdate = await this.generatePlanWithLLM(context, "replan", task);
      
      // Add new tasks if any
      for (const taskData of planUpdate.new_tasks || []) {
        await PlanPoolOperations.addTask(context.conversation_id, {
          description: taskData.description,
          tool: taskData.tool,
          parameters: taskData.parameters || {},
          dependencies: taskData.dependencies || [],
          status: "pending",
          reasoning: taskData.reasoning,
          priority: taskData.priority || 5,
        });
      }

      // Update plan context
      if (planUpdate.context_updates) {
        await PlanPoolOperations.updatePlanContext(context.conversation_id, planUpdate.context_updates);
      }

      // Record replanning decision
      await ThoughtBufferOperations.addDecision(context.conversation_id, {
        decision: "Updated execution plan",
        reasoning: planUpdate.reasoning || "Plan updated based on current progress",
        alternatives_considered: planUpdate.alternatives || [],
        confidence: planUpdate.confidence || 0.7,
      });

      await this.addMessage(
        context.conversation_id,
        "agent",
        `🔄 **Plan Updated**\n\n**New Tasks:** ${planUpdate.new_tasks?.length || 0}\n\n${planUpdate.reasoning}`,
        "agent_thinking",
      );

      return {
        success: true,
        result: {
          plan_type: "update",
          new_tasks: planUpdate.new_tasks?.length || 0,
          reasoning: planUpdate.reasoning,
        },
        should_continue: true,
      };

    } catch (error) {
      console.warn("Plan update failed, using fallback strategy:", error);
      
      // Fallback: create simple tasks based on what's missing
      const hasCharacter = !!context.current_result.character_data;
      const hasWorldbook = !!context.current_result.worldbook_data && context.current_result.worldbook_data.length > 0;
      
      const fallbackTasks = [];
      
      if (!hasCharacter) {
        fallbackTasks.push({
          description: "Generate character data to complete the character creation",
          tool: ToolType.OUTPUT,
          parameters: { type: "character" },
          dependencies: [],
          status: "pending" as const,
          reasoning: "Character data is missing and needs to be generated",
          priority: 8,
        });
      }
      
      if (!hasWorldbook) {
        fallbackTasks.push({
          description: "Generate worldbook entries to complete the world creation",
          tool: ToolType.OUTPUT,
          parameters: { type: "worldbook" },
          dependencies: [],
          status: "pending" as const,
          reasoning: "Worldbook data is missing and needs to be generated",
          priority: 7,
        });
      }
      
      // Add fallback tasks
      for (const taskData of fallbackTasks) {
        await PlanPoolOperations.addTask(context.conversation_id, taskData);
      }
      
      await this.addMessage(
        context.conversation_id,
        "agent",
        `🔄 **Plan Updated (Fallback)**\n\n**New Tasks:** ${fallbackTasks.length}\n\nUsing fallback strategy due to planning difficulties.`,
        "agent_thinking",
      );

      return {
        success: true,
        result: {
          plan_type: "fallback_update",
          new_tasks: fallbackTasks.length,
          reasoning: "Used fallback planning due to LLM error",
        },
        should_continue: true,
      };
    }
  }

  /**
   * Evaluate current progress and determine next steps
   */
  private async evaluateProgress(task: PlanTask, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const hasCharacterData = !!context.current_result.character_data;
    const hasWorldbookData = !!context.current_result.worldbook_data && context.current_result.worldbook_data.length > 0;
    const completedTasks = context.plan_pool.completed_tasks.length;
    const pendingTasks = context.plan_pool.current_tasks.filter(t => t.status === "pending").length;

    const evaluationResult = {
      character_completed: hasCharacterData,
      worldbook_completed: hasWorldbookData,
      completed_tasks: completedTasks,
      pending_tasks: pendingTasks,
      overall_progress: completedTasks / (completedTasks + pendingTasks) * 100,
      is_complete: hasCharacterData && hasWorldbookData,
      next_action: this.determineNextAction(hasCharacterData, hasWorldbookData, pendingTasks),
    };

    await this.addMessage(
      context.conversation_id,
      "agent",
      `📊 **Progress Evaluation**\n\n✅ Character: ${hasCharacterData ? "Complete" : "Pending"}\n✅ Worldbook: ${hasWorldbookData ? "Complete" : "Pending"}\n📈 Progress: ${evaluationResult.overall_progress.toFixed(1)}%\n🎯 Next: ${evaluationResult.next_action}`,
      "agent_thinking",
    );

    // If work is complete, stop execution
    if (evaluationResult.is_complete) {
      await this.addMessage(
        context.conversation_id,
        "agent",
        `🎉 **Generation Complete!**\n\nBoth character and worldbook have been successfully generated.`,
        "agent_thinking",
      );
      
      return {
        success: true,
        result: evaluationResult,
        should_continue: false, // Stop execution
      };
    }

    return {
      success: true,
      result: evaluationResult,
      should_continue: true,
    };
  }

  /**
   * Complete replan - removes obsolete tasks and creates new plan based on user input
   */
  private async completeReplan(task: PlanTask, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    try {
      // Get current task summary for analysis
      const taskSummary = await PlanPoolOperations.getTaskSummary(context.conversation_id);
      const currentPlan = await PlanPoolOperations.getCurrentPlan(context.conversation_id);
      
      // Analyze which tasks should be removed
      const removalAnalysis = await this.analyzeTaskRemoval(context, taskSummary, currentPlan);
      
      // Remove obsolete tasks
      let removedCount = 0;
      for (const criteria of removalAnalysis.removal_criteria) {
        const removed = await PlanPoolOperations.removeTasksByCriteria(
          context.conversation_id,
          criteria,
          removalAnalysis.reason
        );
        removedCount += removed;
      }

      // Remove obsolete goals if specified
      for (const goalId of removalAnalysis.goals_to_remove) {
        await PlanPoolOperations.removeGoal(context.conversation_id, goalId);
      }

      // Create new plan based on updated context
      const newPlanResult = await this.createNewPlanFromContext(context, removalAnalysis.new_focus);
      
      await this.addMessage(
        context.conversation_id,
        "agent",
        `🔄 **Complete Replan Executed**\n\n**Removed:** ${removedCount} obsolete tasks, ${removalAnalysis.goals_to_remove.length} goals\n**Added:** ${newPlanResult.tasks?.length || 0} new tasks\n\n**Reason:** ${removalAnalysis.reason}\n**New Focus:** ${removalAnalysis.new_focus}`,
        "agent_thinking",
      );
      
      return {
        success: true,
        result: {
          removed_tasks: removedCount,
          removed_goals: removalAnalysis.goals_to_remove.length,
          new_tasks: newPlanResult.tasks?.length || 0,
          new_goals: newPlanResult.goals?.length || 0,
          plan_summary: newPlanResult.summary
        },
        should_continue: true,
      };
    } catch (error) {
      console.warn("Complete replan failed, using fallback:", error);
      
      // Fallback: clear all pending tasks and create simple new ones
      const removedCount = await PlanPoolOperations.clearPendingTasks(context.conversation_id, "Complete replan fallback");
      await this.createFallbackPlan(context);
      
      return {
        success: true,
        result: {
          removed_tasks: removedCount,
          removed_goals: 0,
          new_tasks: 4, // fallback creates 4 tasks
          plan_summary: "Fallback replan executed"
        },
        should_continue: true,
      };
    }
  }

  /**
   * Analyze which tasks and goals should be removed based on new context
   */
  private async analyzeTaskRemoval(
    context: ToolExecutionContext, 
    taskSummary: any, 
    currentPlan: any
  ): Promise<{
    removal_criteria: Array<{tool?: string; status?: string; descriptionContains?: string}>;
    goals_to_remove: string[];
    reason: string;
    new_focus: string;
  }> {
    // Get conversation to access message history
    const conversation = await AgentConversationOperations.getConversationById(context.conversation_id);
    if (!conversation) {
      throw new Error(`Conversation not found: ${context.conversation_id}`);
    }

    const recentUserMessages = conversation.messages
      .filter((msg: any) => msg.role === "user")
      .slice(-3)
      .map((msg: any) => msg.content)
      .join("\n");

    // Create contextual prompt using the template
    const systemPrompt = PlanPrompts.ANALYZE_TASK_REMOVAL_PROMPT;
    const promptTemplate = await this.createSimplePrompt(systemPrompt, {
      recent_user_input: recentUserMessages,
      current_tasks: JSON.stringify(currentPlan.current_tasks, null, 2),
      current_goals: JSON.stringify(currentPlan.goal_tree, null, 2),
      task_summary: JSON.stringify(taskSummary, null, 2)
    });
    
    const analysisResult = await this.executeLLMChain(promptTemplate, {}, context, {
      parseJson: true,
      errorMessage: "Failed to analyze task removal"
    });

    return analysisResult || {
      removal_criteria: [{ status: "pending" }],
      goals_to_remove: [],
      reason: "User input changed requirements",
      new_focus: "Adapt to new user requirements"
    };
  }

  /**
   * Create new plan based on current context and focus
   */
  private async createNewPlanFromContext(context: ToolExecutionContext, newFocus: string): Promise<any> {
    // Get conversation to access message history - consistent with base-tool pattern
    const conversation = await AgentConversationOperations.getConversationById(context.conversation_id);
    if (!conversation) {
      throw new Error(`Conversation not found: ${context.conversation_id}`);
    }

    const recentUserMessages = conversation.messages
      .filter((msg: any) => msg.role === "user")
      .slice(-3)
      .map((msg: any) => msg.content)
      .join("\n");

    // Create contextual prompt using base-tool method - consistent with other tools
    const systemPrompt = PlanPrompts.CREATE_NEW_PLAN_PROMPT;
    const promptTemplate = await this.createSimplePrompt(systemPrompt, {
      user_requirements: recentUserMessages,
      new_focus: newFocus,
      conversation_id: context.conversation_id
    });
    
    const newPlan = await this.executeLLMChain(promptTemplate, {}, context, {
      parseJson: true,
      errorMessage: "Failed to create new plan"
    });

    if (newPlan?.tasks) {
      for (const newTask of newPlan.tasks) {
        await PlanPoolOperations.addTask(context.conversation_id, newTask);
      }
    }

    if (newPlan?.goals) {
      for (const newGoal of newPlan.goals) {
        await PlanPoolOperations.addGoal(context.conversation_id, newGoal);
      }
    }

    return newPlan || { tasks: [], goals: [], summary: "Fallback plan created" };
  }

  /**
   * Analyze failure patterns and suggest alternatives
   */
  private async analyzeFailures(task: PlanTask, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const failureHistory = context.plan_pool.context.failure_history;
    const criticallyFailedTools = Object.entries(failureHistory.failed_tool_attempts)
      .filter(([tool, count]) => count >= 3);

    const analysisResult = {
      critical_tools: criticallyFailedTools,
      total_failures: Object.values(failureHistory.failed_tool_attempts).reduce((a, b) => a + b, 0),
      recent_failure_patterns: this.identifyFailurePatterns(failureHistory.recent_failures),
      recommended_actions: this.suggestAlternatives(criticallyFailedTools),
    };

    await this.addMessage(
      context.conversation_id,
      "agent",
      `⚠️  **Failure Analysis Complete**\n\n**Critical Tools:** ${criticallyFailedTools.map(([tool, count]) => `${tool} (${count} failures)`).join(', ')}\n**Total Failures:** ${analysisResult.total_failures}\n\n**Recommendations:**\n${analysisResult.recommended_actions.join('\n')}`,
      "agent_thinking",
    );

    // Update plan context to reflect failure analysis
    await PlanPoolOperations.updatePlanContext(context.conversation_id, {
      current_focus: "Implementing alternative strategies due to repeated failures",
    });

    return {
      success: true,
      result: analysisResult,
      should_continue: true,
      should_update_plan: true,
    };
  }

  /**
   * Generate plan using LLM
   */
  private async generatePlanWithLLM(context: ToolExecutionContext, type: "initial" | "replan", task: PlanTask): Promise<any> {
    const prompt = type === "initial" 
      ? await this.createInitialPlanningPrompt(context, task)
      : await this.createReplanningPrompt(context, task);
    
    return await this.executeLLMChain(prompt, {}, context, {
      parseJson: true,
      errorMessage: `Failed to generate ${type} plan`
    });
  }

  /**
   * Create initial planning prompt using the prompts module
   */
  private async createInitialPlanningPrompt(context: ToolExecutionContext, task: PlanTask) {
    return await this.createContextualPrompt(
      PlanPrompts.getInitialPlanningSystemPrompt(),
      PlanPrompts.getInitialPlanningHumanTemplate(),
      task,
      context
    );
  }

  /**
   * Create replanning prompt using the prompts module
   */
  private async createReplanningPrompt(context: ToolExecutionContext, task: PlanTask) {
    return await this.createContextualPrompt(
      PlanPrompts.getReplanningSystemPrompt(),
      PlanPrompts.getReplanningHumanTemplate(),
      task,
      context
    );
  }

  /**
   * Create fallback plan when LLM planning fails
   */
  private async createFallbackPlan(context: ToolExecutionContext): Promise<void> {
    const basicTasks = [
      {
        description: "Gather user requirements and preferences for character and worldbook creation",
        tool: ToolType.ASK_USER,
        parameters: {},
        dependencies: [],
        status: "pending" as const,
        priority: 10,
        reasoning: "Need to understand user requirements",
      },
      {
        description: "Search for creative inspiration and references relevant to the user's request",
        tool: ToolType.SEARCH,
        parameters: {},
        dependencies: [],
        status: "pending" as const,
        priority: 8,
        reasoning: "Gather creative inspiration",
      },
      {
        description: "Generate character data based on user requirements and inspiration",
        tool: ToolType.OUTPUT,
        parameters: { type: "character" },
        dependencies: [],
        status: "pending" as const,
        priority: 6,
        reasoning: "Create the character",
      },
      {
        description: "Generate worldbook entries that complement the character and setting",
        tool: ToolType.OUTPUT,
        parameters: { type: "worldbook" },
        dependencies: [],
        status: "pending" as const,
        priority: 5,
        reasoning: "Create the worldbook",
      },
    ];

    for (const task of basicTasks) {
      await PlanPoolOperations.addTask(context.conversation_id, task);
    }
  }

  /**
   * Identify patterns in recent failures
   */
  private identifyFailurePatterns(recentFailures: any[]): string[] {
    const patterns = [];
    const errorTypes = recentFailures.map(f => f.error.toLowerCase());
    
    if (errorTypes.some(e => e.includes('timeout') || e.includes('network'))) {
      patterns.push("Network/timeout issues detected");
    }
    if (errorTypes.some(e => e.includes('parse') || e.includes('json'))) {
      patterns.push("Data parsing issues detected");
    }
    if (errorTypes.some(e => e.includes('auth') || e.includes('key'))) {
      patterns.push("Authentication issues detected");
    }
    
    return patterns;
  }

  /**
   * Suggest alternative approaches for failed tools
   */
  private suggestAlternatives(criticallyFailedTools: [string, number][]): string[] {
    const suggestions = [];
    
    for (const [tool, count] of criticallyFailedTools) {
      suggestions.push(...PlanPrompts.getFailureAnalysisSuggestions(tool, count));
    }
    
    if (suggestions.length === 0) {
      suggestions.push("• Consider manual intervention or simplified approach");
    }
    
    return suggestions;
  }

  /**
   * Determine next action based on current state
   */
  private determineNextAction(hasCharacter: boolean, hasWorldbook: boolean, pendingTasks: number): string {
    if (!hasCharacter && !hasWorldbook) {
      return "Start with character generation";
    } else if (hasCharacter && !hasWorldbook) {
      return "Focus on worldbook creation";
    } else if (!hasCharacter && hasWorldbook) {
      return "Complete character creation";
    } else if (pendingTasks > 0) {
      return "Complete remaining tasks";
    } else {
      return "Generation complete";
    }
  }
} 