import { BaseTool } from "./base-tool";
import { ToolType, ToolExecutionContext, ToolExecutionResult, PlanTask } from "../models/agent-model";

/**
 * Update Plan Tool - Update the current plan
 */
export class UpdatePlanTool extends BaseTool {
  readonly toolType = ToolType.UPDATE_PLAN;
  readonly name = "Plan Updater";
  readonly description = "Update the current execution plan";

  async executeTask(task: PlanTask, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    await this.addThought(context.conversation_id, "decision", "Plan update requested", task.id);
    
    // This triggers a replanning phase in the main engine
    return {
      success: true,
      result: { updated: true },
      should_update_plan: true,
      should_continue: true,
    };
  }
} 
