import { BasePlanTool } from "../base-tool";
import { ToolType, PlanToolContext } from "../../models/agent-model";
import { PlanningOperations } from "../../data/agent/plan-pool-operations";
import { planPrompts } from "./prompts";
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

  protected thinking: PlanThinking;

  constructor() {
    super();
    this.thinking = new PlanThinking();
  }

  /**
   * Core work logic - create and manage plans using intelligent routing
   * 核心工作逻辑 - 使用智能路由创建和管理计划
   */
  async doWork(context: PlanToolContext): Promise<any> {
    // Define available sub-tools
    const availableSubTools = [
      "createInitialPlan",
      "analyzeFailures", 
      "evaluateProgress",
      "updatePlan"
    ];

    try {
      // Use intelligent routing to select the best sub-tool
      console.log(`🧠 [PLAN] Using intelligent routing to select sub-tool...`);
      const routingDecision = await this.thinking.routeToSubTool(context, availableSubTools);
      
      console.log(`🎯 [PLAN] Selected sub-tool: ${routingDecision.selected_sub_tool} (confidence: ${routingDecision.confidence}%)`);
      console.log(`📝 [PLAN] Reasoning: ${routingDecision.reasoning}`);

      // Route to the selected sub-tool
      switch (routingDecision.selected_sub_tool) {
        case "createInitialPlan":
          return await this.createInitialPlan(context);
        case "analyzeFailures":
          return await this.analyzeFailures(context);
        case "evaluateProgress":
          return await this.evaluateProgress(context);
        case "updatePlan":
          return await this.updatePlan(context);
        default:
          // Log unknown sub-tool and throw error instead of fallback
          console.error(`[PLAN] Unknown sub-tool: ${routingDecision.selected_sub_tool}`);
          throw new Error(`Unknown sub-tool selected: ${routingDecision.selected_sub_tool}`);
      }
    } catch (error) {
      // Log failure and propagate error instead of fallback
      console.error(`[PLAN] Tool execution failed:`, error);
      throw error; // Re-throw to let base class handle
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
      // Log improvement failure and throw error instead of fallback
      console.error(`[PLAN] Plan improvement failed:`, error);
      throw new Error(`Plan improvement failed: ${error instanceof Error ? error.message : error}`);
    }
  }

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
      // Don't fake success with fallback - let base class handle failure
      throw new Error(`Initial plan creation failed: ${error instanceof Error ? error.message : error}`);
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
      // Don't fake success with fallback - let base class handle failure
      throw new Error(`Plan update failed: ${error instanceof Error ? error.message : error}`);
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
   * Add planning message to conversation
   */

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