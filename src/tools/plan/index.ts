import { BasePlanTool } from "../base-tool";
import { ToolType, PlanToolContext } from "../../models/agent-model";
import { PlanningOperations } from "../../data/agent/plan-pool-operations";
import { planPrompts } from "./prompts";
import { AgentConversationOperations } from "../../data/agent/agent-conversation-operations";
import { PlanThinking } from "./think";
import { ImprovementInstruction } from "../base-think";

/**
 * Plan Tool - Enhanced with thinking capabilities
 * 计划工具 - 增强思考能力
 */
export class PlanTool extends BasePlanTool {
  readonly toolType = ToolType.PLAN; 
  readonly name = "Plan Manager";
  readonly description = "Create initial plans and update execution strategy based on current progress";

  private thinking: PlanThinking;

  constructor() {
    super();
    this.thinking = new PlanThinking();
  }

  /**
   * Core work logic - create and manage plans
   * 核心工作逻辑 - 创建和管理计划
   */
  async doWork(context: PlanToolContext): Promise<any> {
    // Determine what type of planning is needed based on current state
    const needsInitialPlan = context.planning_context.current_tasks.length === 0;
    const hasFailures = Object.values(context.planning_context.context.failure_history.failed_tool_attempts).some(count => count > 0);
    const hasCharacter = !!context.task_progress.character_data;
    const hasWorldbook = !!context.task_progress.worldbook_data && context.task_progress.worldbook_data.length > 0;

    if (needsInitialPlan) {
      return await this.createInitialPlan(context);
    } else if (hasFailures) {
      return await this.analyzeFailures(context);
    } else if (hasCharacter && hasWorldbook) {
      return await this.evaluateProgress(context);
    } else {
      return await this.updatePlan(context);
    }
  }

  /**
   * Improvement logic - enhance planning based on feedback
   * 改进逻辑 - 根据反馈增强计划
   */
  async improve(
    currentResult: any,
    instruction: ImprovementInstruction,
    context: PlanToolContext
  ): Promise<any> {
    try {
      console.log(`🔄 [PLAN] Improving plan based on: ${instruction.focus_areas.join(', ')}`);
      
      // Generate improved plan based on instruction
      const improvedPlan = await this.generateImprovedPlan(
        currentResult,
        instruction,
        context
      );
      
      return {
        ...improvedPlan,
        improvementApplied: instruction.focus_areas,
        previousResult: currentResult
      };
      
    } catch (error) {
      console.warn(`[PLAN] Improvement failed, using original result:`, error);
      return currentResult;
    }
  }

  /**
   * Implement thinking capabilities using public methods
   */
  async evaluate(result: any, context: PlanToolContext, attempt: number = 1) {
    return await this.thinking.evaluateResult(result, context, attempt);
  }

  async generateImprovement(result: any, evaluation: any, context: PlanToolContext) {
    return await this.thinking.generateImprovementInstruction(result, evaluation, context);
  }

  protected buildEvaluationPrompt = () => { throw new Error("Use evaluate() instead"); };
  protected buildImprovementPrompt = () => { throw new Error("Use generateImprovement() instead"); };
  protected executeThinkingChain = () => { throw new Error("Use thinking methods directly"); };

  /**
   * Generate improved plan based on feedback
   */
  private async generateImprovedPlan(
    currentResult: any,
    instruction: ImprovementInstruction,
    context: PlanToolContext
  ): Promise<any> {
    const improvementPrompt = `Improve the planning based on these instructions:

FOCUS AREAS: ${instruction.focus_areas.join(', ')}
SPECIFIC REQUESTS: ${instruction.specific_requests.join(', ')}
TARGET QUALITY: ${instruction.quality_target}/100

CURRENT PLAN:
${JSON.stringify(currentResult, null, 2)}

Generate improved planning that addresses the feedback above.`;

    const prompt = this.buildPlanningPrompt(
      planPrompts.INITIAL_PLANNING_SYSTEM + "\n\nYou are improving existing plans based on feedback.",
      improvementPrompt,
      context
    );

    const improvedContent = await this.executeLLMChain(prompt, {
      improvement_context: "Improving plan based on feedback"
    }, context, {
      errorMessage: "Failed to generate improved plan"
    });

    return {
      ...currentResult,
      reasoning: improvedContent,
      improved: true
    };
  }

  /**
   * Create the initial execution plan
   */
  private async createInitialPlan(context: PlanToolContext): Promise<any> {
    try {
      const planData = await this.generatePlanWithLLM(context, "initial");
      
      // Create goals
      for (const goal of planData.goals || []) {
        await PlanningOperations.addGoal(context.conversation_id, {
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
        await PlanningOperations.addTask(context.conversation_id, {
          description: taskData.description,
          tool: taskData.tool,
          parameters: taskData.parameters || {},
          dependencies: taskData.dependencies || [],
          status: "pending",
          reasoning: taskData.reasoning,
          priority: taskData.priority || 5,
        });
      }

      await this.addPlanMessage(
        context,
        `📋 **Initial Plan Created**\n\n**Goals:** ${planData.goals?.length || 0}\n**Tasks:** ${planData.tasks?.length || 0}\n\n${planData.reasoning}`
      );

      return {
        plan_type: "initial",
        goals_created: planData.goals?.length || 0,
        tasks_created: planData.tasks?.length || 0,
        reasoning: planData.reasoning,
      };

    } catch (error) {
      // Create fallback plan
      await this.createFallbackPlan(context);
      
      return {
        plan_type: "fallback",
        reasoning: "Used fallback planning due to LLM error"
      };
    }
  }

  /**
   * Update the current plan based on progress
   */
  private async updatePlan(context: PlanToolContext): Promise<any> {
    try {
      const planUpdate = await this.generatePlanWithLLM(context, "replan");
      
      // Add new tasks if any
      for (const taskData of planUpdate.new_tasks || []) {
        await PlanningOperations.addTask(context.conversation_id, {
          description: taskData.description,
          tool: taskData.tool,
          parameters: taskData.parameters || {},
          dependencies: taskData.dependencies || [],
          status: "pending",
          reasoning: taskData.reasoning,
          priority: taskData.priority || 5,
        });
      }

      // Update planning context
      if (planUpdate.context_updates) {
        await PlanningOperations.updatePlanningContext(context.conversation_id, planUpdate.context_updates);
      }

      await this.addPlanMessage(
        context,
        `🔄 **Plan Updated**\n\n**New Tasks:** ${planUpdate.new_tasks?.length || 0}\n\n${planUpdate.reasoning}`
      );

      return {
        plan_type: "update",
        new_tasks: planUpdate.new_tasks?.length || 0,
        reasoning: planUpdate.reasoning,
      };

    } catch (error) {
      console.warn("Plan update failed, using fallback strategy:", error);
      
      // Fallback: create simple tasks based on what's missing
      const hasCharacter = !!context.task_progress.character_data;
      const hasWorldbook = !!context.task_progress.worldbook_data && context.task_progress.worldbook_data.length > 0;
      
      const fallbackTasks = this.createFallbackTasks(hasCharacter, hasWorldbook);
      
      // Add fallback tasks
      for (const taskData of fallbackTasks) {
        await PlanningOperations.addTask(context.conversation_id, taskData);
      }
      
      await this.addPlanMessage(
        context,
        `🔄 **Plan Updated (Fallback)**\n\n**New Tasks:** ${fallbackTasks.length}\n\nUsing fallback strategy due to planning difficulties.`
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
   * Complete replan - removes obsolete tasks and creates new plan based on user input
   */
  private async completeReplan(context: PlanToolContext): Promise<any> {
    try {
      // Get current task summary for analysis
      const taskSummary = await PlanningOperations.getTaskSummary(context.conversation_id);
      
      // Analyze which tasks should be removed
      const removalAnalysis = await this.analyzeTaskRemoval(context, taskSummary);
      
      // Remove obsolete tasks
      let removedCount = 0;
      for (const criteria of removalAnalysis.removal_criteria) {
        const removed = await PlanningOperations.removeTasksByCriteria(
          context.conversation_id,
          criteria,
          removalAnalysis.reason
        );
        removedCount += removed;
      }

      // Remove obsolete goals if specified
      for (const goalId of removalAnalysis.goals_to_remove) {
        await PlanningOperations.removeGoal(context.conversation_id, goalId);
      }

      // Create new plan based on updated context
      const newPlanResult = await this.createNewPlanFromContext(context, removalAnalysis.new_focus);
      
      await this.addPlanMessage(
        context,
        `🔄 **Complete Replan Executed**\n\n**Removed:** ${removedCount} obsolete tasks, ${removalAnalysis.goals_to_remove.length} goals\n**Added:** ${newPlanResult.tasks?.length || 0} new tasks\n\n**Reason:** ${removalAnalysis.reason}\n**New Focus:** ${removalAnalysis.new_focus}`
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
      const removedCount = await PlanningOperations.clearPendingTasks(context.conversation_id, "Complete replan fallback");
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
   * Evaluate current progress and determine next steps
   */
  private async evaluateProgress(context: PlanToolContext): Promise<any> {
    const hasCharacterData = !!context.task_progress.character_data;
    const hasWorldbookData = !!context.task_progress.worldbook_data && context.task_progress.worldbook_data.length > 0;
    const completedTasks = context.planning_context.completed_tasks.length;
    const pendingTasks = context.planning_context.current_tasks.filter(t => t.status === "pending").length;

    const evaluationResult = {
      character_completed: hasCharacterData,
      worldbook_completed: hasWorldbookData,
      completed_tasks: completedTasks,
      pending_tasks: pendingTasks,
      overall_progress: completedTasks / (completedTasks + pendingTasks) * 100,
      is_complete: hasCharacterData && hasWorldbookData,
      next_action: this.determineNextAction(hasCharacterData, hasWorldbookData, pendingTasks),
    };

    await this.addPlanMessage(
      context,
      `📊 **Progress Evaluation**\n\n✅ Character: ${hasCharacterData ? "Complete" : "Pending"}\n✅ Worldbook: ${hasWorldbookData ? "Complete" : "Pending"}\n📈 Progress: ${evaluationResult.overall_progress.toFixed(1)}%\n🎯 Next: ${evaluationResult.next_action}`
    );

    // If work is complete, stop execution
    if (evaluationResult.is_complete) {
      await this.addPlanMessage(
        context,
        `🎉 **Generation Complete!**\n\nBoth character and worldbook have been successfully generated.`
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
  private async analyzeFailures(context: PlanToolContext): Promise<any> {
    const failureHistory = context.planning_context.context.failure_history;
    const criticallyFailedTools = Object.entries(failureHistory.failed_tool_attempts)
      .filter(([tool, count]) => count >= 3);

    const analysisResult = {
      critical_tools: criticallyFailedTools,
      total_failures: Object.values(failureHistory.failed_tool_attempts).reduce((a, b) => a + b, 0),
      recent_failure_patterns: this.identifyFailurePatterns(failureHistory.recent_failures),
      recommended_actions: this.suggestAlternatives(criticallyFailedTools),
    };

    await this.addPlanMessage(
      context,
      `⚠️  **Failure Analysis Complete**\n\n**Critical Tools:** ${criticallyFailedTools.map(([tool, count]) => `${tool} (${count} failures)`).join(', ')}\n**Total Failures:** ${analysisResult.total_failures}\n\n**Recommendations:**\n${analysisResult.recommended_actions.join('\n')}`
    );

    // Update planning context to reflect failure analysis
    await PlanningOperations.updatePlanningContext(context.conversation_id, {
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
   * Generate plan using LLM with planning context
   */
  private async generatePlanWithLLM(context: PlanToolContext, type: "initial" | "replan"): Promise<any> {
    const prompt = type === "initial" 
      ? this.buildPlanningPrompt(
          planPrompts.INITIAL_PLANNING_SYSTEM,
          planPrompts.INITIAL_PLANNING_HUMAN,
          context
        )
      : this.buildPlanningPrompt(
          planPrompts.REPLANNING_SYSTEM,
          planPrompts.REPLANNING_HUMAN,
          context
        );
    
    return await this.executeLLMChain(prompt, {}, context, {
      parseJson: true,
      errorMessage: `Failed to generate ${type} plan`
    });
  }

  /**
   * Analyze which tasks and goals should be removed based on new context
   */
  private async analyzeTaskRemoval(
    context: PlanToolContext, 
    taskSummary: any
  ): Promise<{
    removal_criteria: Array<{tool?: string; status?: string; descriptionContains?: string}>;
    goals_to_remove: string[];
    reason: string;
    new_focus: string;
  }> {
    const recentUserMessages = context.conversation_history
      .filter(msg => msg.role === "user")
      .slice(-3)
      .map(msg => msg.content)
      .join("\n");

    const prompt = this.buildPlanningPrompt(
      planPrompts.ANALYZE_TASK_REMOVAL_SYSTEM,
      planPrompts.ANALYZE_TASK_REMOVAL_HUMAN,
      context
    );
    
    const analysisResult = await this.executeLLMChain(prompt, {
      recent_user_input: recentUserMessages,
      current_tasks: JSON.stringify(context.planning_context.current_tasks, null, 2),
      current_goals: JSON.stringify(context.planning_context.goals, null, 2),
      task_summary: JSON.stringify(taskSummary, null, 2)
    }, context, {
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
  private async createNewPlanFromContext(context: PlanToolContext, newFocus: string): Promise<any> {
    const recentUserMessages = context.conversation_history
      .filter(msg => msg.role === "user")
      .slice(-3)
      .map(msg => msg.content)
      .join("\n");

    const prompt = this.buildPlanningPrompt(
      planPrompts.CREATE_NEW_PLAN_SYSTEM,
      planPrompts.CREATE_NEW_PLAN_HUMAN,
      context
    );
    
    const newPlan = await this.executeLLMChain(prompt, {
      user_requirements: recentUserMessages,
      new_focus: newFocus
    }, context, {
      parseJson: true,
      errorMessage: "Failed to create new plan"
    });

    if (newPlan?.tasks) {
      for (const newTask of newPlan.tasks) {
        await PlanningOperations.addTask(context.conversation_id, newTask);
      }
    }

    if (newPlan?.goals) {
      for (const newGoal of newPlan.goals) {
        await PlanningOperations.addGoal(context.conversation_id, newGoal);
      }
    }

    return newPlan || { tasks: [], goals: [], summary: "Fallback plan created" };
  }

  /**
   * Create fallback plan when LLM planning fails
   */
  private async createFallbackPlan(context: PlanToolContext): Promise<void> {
    const hasCharacter = !!context.task_progress.character_data;
    const hasWorldbook = !!context.task_progress.worldbook_data && context.task_progress.worldbook_data.length > 0;
    
    const basicTasks = this.createFallbackTasks(hasCharacter, hasWorldbook);
    
    // Add fallback tasks
    for (const taskData of basicTasks) {
      await PlanningOperations.addTask(context.conversation_id, taskData);
    }
    
    await this.addPlanMessage(
      context,
      `📋 **Fallback Plan Created**\n\n**Tasks:** ${basicTasks.length}\n\nUsing fallback strategy due to planning difficulties.`
    );
  }

  /**
   * Create fallback tasks based on current progress
   */
  private createFallbackTasks(hasCharacter: boolean, hasWorldbook: boolean): any[] {
    const basicTasks = [];
    
    if (!hasCharacter && !hasWorldbook) {
      basicTasks.push({
        description: "Gather user requirements and preferences for character and worldbook creation",
        tool: ToolType.ASK_USER,
        parameters: { type: "requirements" },
        dependencies: [],
        status: "pending" as const,
        reasoning: "Need user input to understand requirements",
        priority: 9,
      });
    }
    
    if (!hasCharacter) {
      basicTasks.push({
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
      basicTasks.push({
        description: "Generate worldbook entries to complete the world creation",
        tool: ToolType.OUTPUT,
        parameters: { type: "worldbook" },
        dependencies: [],
        status: "pending" as const,
        reasoning: "Worldbook data is missing and needs to be generated",
        priority: 7,
      });
    }
    
    basicTasks.push({
      description: "Present final results to user",
      tool: ToolType.OUTPUT,
      parameters: { type: "final" },
      dependencies: [],
      status: "pending" as const,
      reasoning: "Present completed work to user",
      priority: 6,
    });
    
    return basicTasks;
  }

  /**
   * Add planning message to conversation
   */
  private async addPlanMessage(context: PlanToolContext, content: string): Promise<void> {
    await AgentConversationOperations.addMessage(context.conversation_id, {
      role: "agent",
      content,
      message_type: "agent_thinking",
    });
  }

  /**
   * Identify failure patterns from recent failures
   */
  private identifyFailurePatterns(recentFailures: any[]): string[] {
    const patterns = [];
    
    if (recentFailures.length >= 3) {
      // Group by tool
      const toolFailures = recentFailures.reduce((acc, failure) => {
        acc[failure.tool] = (acc[failure.tool] || 0) + 1;
        return acc;
      }, {});
      
             for (const [tool, count] of Object.entries(toolFailures)) {
         if (typeof count === 'number' && count >= 2) {
           patterns.push(`${tool} tool failing repeatedly (${count} times)`);
         }
       }
      
      // Check for error patterns
      const errorTypes = recentFailures.map(f => f.error.toLowerCase());
      if (errorTypes.filter(e => e.includes('api')).length >= 2) {
        patterns.push("API connection issues");
    }
      if (errorTypes.filter(e => e.includes('timeout')).length >= 2) {
        patterns.push("Timeout issues");
      }
    }
    
    return patterns.length > 0 ? patterns : ["No clear patterns identified"];
  }

  /**
   * Suggest alternatives for critically failed tools
   */
  private suggestAlternatives(criticallyFailedTools: [string, number][]): string[] {
    const alternatives = [];
    
    for (const [tool, count] of criticallyFailedTools) {
      switch (tool) {
        case ToolType.OUTPUT:
          alternatives.push("• Try breaking output tasks into smaller pieces");
          alternatives.push("• Ask user for simpler requirements");
          break;
        case ToolType.SEARCH:
          alternatives.push("• Use built-in inspiration instead of web search");
          alternatives.push("• Ask user to provide reference materials");
          break;
        case ToolType.ASK_USER:
          alternatives.push("• Use simpler, more direct questions");
          alternatives.push("• Provide multiple choice options");
          break;
        default:
          alternatives.push(`• Consider manual approach for ${tool} tasks`);
      }
    }
    
    if (alternatives.length === 0) {
      alternatives.push("• Continue with current strategy but monitor closely");
    }
    
    return alternatives;
  }

  /**
   * Determine next action based on current state
   */
  private determineNextAction(hasCharacter: boolean, hasWorldbook: boolean, pendingTasks: number): string {
    if (!hasCharacter && !hasWorldbook) {
      return "Start with character generation";
    } else if (hasCharacter && !hasWorldbook) {
      return "Generate worldbook entries";
    } else if (!hasCharacter && hasWorldbook) {
      return "Complete character generation";
    } else if (pendingTasks > 0) {
      return "Complete remaining tasks";
    } else {
      return "Present final results";
    }
  }
} 