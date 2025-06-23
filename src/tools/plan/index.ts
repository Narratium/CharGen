import { BaseTool } from "../base-tool";
import { ToolType, ToolExecutionContext, ToolExecutionResult, PlanTask } from "../../models/agent-model";
import { PlanPoolOperations } from "../../data/agent/plan-pool-operations";
import { ThoughtBufferOperations } from "../../data/agent/thought-buffer-operations";
import { PlanPrompts } from "./prompts";

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