import { 
  ToolType, 
  ExecutionContext, 
  ExecutionResult 
} from "../../models/agent-model";
import { BaseSimpleTool, ToolParameter, DetailedToolInfo } from "../base-tool";

/**
 * Reflect Tool - Pure Execution Unit
 * Adds new tasks to the task queue based on provided parameters from planner
 */
export class ReflectTool extends BaseSimpleTool {
  
  readonly toolType = ToolType.REFLECT;
  readonly name = "REFLECT";
  readonly description = "Add new tasks to the task queue based on analysis of current progress and needs. Use when you identify gaps in the current task plan, need to break down complex work into smaller steps, or when new requirements emerge during generation. IMPORTANTLY: Also use this tool when the task queue is empty but the main objective is not yet complete - analyze what still needs to be done and generate the necessary tasks to finish the work. This tool helps maintain organized task flow and ensures comprehensive character and worldbook development.";
  
  readonly parameters: ToolParameter[] = [
    {
      name: "new_tasks",
      type: "array",
      description: "Array of new task descriptions to add to the task queue. Each item should be a clear, actionable task string (e.g., 'Research character's family background', 'Define world's magic system')",
      required: true
    }
  ];

  getToolInfo(): DetailedToolInfo {
    return {
      type: ToolType.REFLECT,
      name: this.name,
      description: this.description,
      parameters: this.parameters
    };
  }

  protected async doWork(parameters: Record<string, any>, context: ExecutionContext): Promise<ExecutionResult> {
    const newTasks = parameters.new_tasks;
    
    if (!newTasks || !Array.isArray(newTasks)) {
      return this.createFailureResult("REFLECT tool requires 'new_tasks' parameter as an array.");
    }
    
    if (newTasks.length === 0) {
      return this.createFailureResult("REFLECT tool requires at least one task in 'new_tasks' array.");
    }
    
    // Validate that each task is a string
    for (let i = 0; i < newTasks.length; i++) {
      if (typeof newTasks[i] !== 'string' || newTasks[i].trim() === '') {
        return this.createFailureResult(`REFLECT tool: Task ${i + 1} must be a non-empty string.`);
      }
    }

    return this.createSuccessResult({
      new_tasks: newTasks,
      tasks_count: newTasks.length
    });
  }
} 