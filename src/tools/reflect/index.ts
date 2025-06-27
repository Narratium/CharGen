import { 
  ToolType, 
  ExecutionContext, 
  ExecutionResult, 
  TaskEntry 
} from "../../models/agent-model";
import { BaseSimpleTool, ToolParameter, DetailedToolInfo } from "../base-tool";

/**
 * Reflect Tool - Pure Execution Unit
 * Updates task queue based on provided parameters from planner
 */
export class ReflectTool extends BaseSimpleTool {
  
  readonly toolType = ToolType.REFLECT;
  readonly name = "REFLECT";
  readonly description = "Analyze progress and manage task queue based on current state";
  
  readonly parameters: ToolParameter[] = [
    {
      name: "action",
      type: "string",
      description: "What action to take with the task queue and progress analysis",
      required: true,
      options: ["add_tasks", "decompose_tasks", "auto"]
    },
    {
      name: "new_tasks",
      type: "array",
      description: "Array of new task descriptions to add to the task queue. Each item should be a clear, actionable task string (e.g., 'Research character's family background', 'Define world's magic system')",
      required: false
    },
    {
      name: "decompose_tasks",
      type: "boolean", 
      description: "Whether to break down complex existing tasks into smaller, more manageable sub-tasks",
      required: false
    }
  ];



  protected async doWork(parameters: Record<string, any>, context: ExecutionContext): Promise<ExecutionResult> {
    const action = parameters.action || "auto";
    const newTasks = parameters.new_tasks || [];
    const shouldDecompose = parameters.decompose_tasks !== false;
    
    console.log(`🤔 Reflecting on task queue: ${action}`);

    const currentQueue = context.research_state.task_queue || [];
    const updatedQueue = [...currentQueue];
    
    let addedCount = 0;
    let decomposedCount = 0;

    // Add new tasks if provided
    if (newTasks.length > 0) {
      for (const taskDesc of newTasks) {
        const newTask: TaskEntry = {
          id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          description: taskDesc,
          priority: 5,
          status: "pending",
          reasoning: "Added during reflection"
        };
        updatedQueue.push(newTask);
        addedCount++;
      }
    }

    // Auto-generate tasks based on action type
    if (action === "auto") {
      const autoTasks = this.generateAutoTasks(context);
      for (const taskDesc of autoTasks) {
        const newTask: TaskEntry = {
          id: `auto_task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          description: taskDesc,
          priority: 6,
          status: "pending",
          reasoning: "Auto-generated during reflection"
        };
        updatedQueue.push(newTask);
        addedCount++;
      }
    }

    // Decompose complex tasks if requested
    if (shouldDecompose) {
      const complexTasks = updatedQueue.filter(t => 
        t.status === "pending" && 
        t.description.length > 100 && 
        !t.parent_task_id
      );

      for (const complexTask of complexTasks) {
        const subTasks = this.decomposeComplexTask(complexTask);
        if (subTasks.length > 1) {
          // Mark parent as decomposed
          complexTask.status = "obsolete";
          complexTask.reasoning = "Decomposed into sub-tasks";
          
          // Add sub-tasks
          for (const subTaskDesc of subTasks) {
            const subTask: TaskEntry = {
              id: `subtask_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              description: subTaskDesc,
              priority: complexTask.priority,
              status: "pending",
              parent_task_id: complexTask.id,
              reasoning: "Sub-task from decomposition"
            };
            updatedQueue.push(subTask);
            addedCount++;
          }
          decomposedCount++;
        }
      }
    }

    console.log(`✅ Reflection complete and saved: ${addedCount} tasks added, ${decomposedCount} tasks decomposed`);

    return this.createSuccessResult({
      action,
      added_count: addedCount,
      decomposed_count: decomposedCount,
      updated_task_queue: updatedQueue
    });
  }

  /**
   * Generate automatic tasks based on current state
   */
  private generateAutoTasks(context: ExecutionContext): string[] {
    const gaps = context.research_state.knowledge_gaps || [];
    const tasks: string[] = [];
    
    // Generate tasks based on knowledge gaps
    for (const gap of gaps.slice(0, 3)) { // Max 3 auto tasks
      tasks.push(`Research and gather information about: ${gap}`);
    }
    
    // Add default tasks if no gaps
    if (tasks.length === 0) {
      tasks.push("Review and analyze current progress");
      tasks.push("Identify next steps for completion");
    }
    
    return tasks;
  }

  /**
   * Decompose a complex task into simpler sub-tasks
   */
  private decomposeComplexTask(task: TaskEntry): string[] {
    const description = task.description.toLowerCase();
    
    // Simple rule-based decomposition
    if (description.includes("character") && description.includes("create")) {
      return [
        "Define character basic information (name, age, appearance)",
        "Develop character personality and traits",
        "Create character background and history",
        "Write character dialogue examples"
      ];
    }
    
    if (description.includes("worldbook") || description.includes("world")) {
      return [
        "Research world setting and theme",
        "Create location entries",
        "Develop character relationships",
        "Write lore and history entries"
      ];
    }
    
    // Generic decomposition
    if (description.length > 100) {
      const parts = description.split(/[,;]/);
      if (parts.length > 1) {
        return parts.map(part => part.trim()).filter(part => part.length > 10);
      }
    }
    
    return []; // No decomposition possible
  }
} 