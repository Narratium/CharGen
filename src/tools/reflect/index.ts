import { 
  ToolType, 
  ExecutionContext, 
  ExecutionResult, 
  TaskEntry 
} from "../../models/agent-model";
import { BaseSimpleTool, ToolParameter, DetailedToolInfo } from "../base-tool";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

/**
 * Reflect Tool - Simple Task Management
 * Think about current progress and either add new tasks or decompose existing tasks
 */
export class ReflectTool extends BaseSimpleTool {
  
  // Required BaseSimpleTool properties
  readonly toolType = ToolType.REFLECT;
  readonly name = "Reflect Tool";
  readonly description = "Think about progress and update task queue with new tasks or sub-tasks";
  
  readonly parameters = [
    {
      name: "action",
      type: "string" as const,
      required: false,
      description: "What to do: add new tasks or decompose existing tasks",
      options: ["add_tasks", "decompose_tasks", "auto"],
      default: "auto"
    }
  ];

  getToolInfo(): DetailedToolInfo {
    return {
      type: ToolType.REFLECT,
      name: this.name,
      description: this.description,
      parameters: this.parameters,
      examples: [
        "Think about what tasks are needed next",
        "Break down complex tasks into smaller ones",
        "Add missing tasks based on current progress"
      ]
    };
  }

  protected async doWork(
    parameters: Record<string, any>, 
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    console.log("🤔 Reflecting on task progress and updating task queue...");

    const action = parameters.action || "auto";

    try {
      // Think about current state and decide what tasks to add/modify
      const taskUpdates = await this.thinkAndUpdateTasks(context, action);
      
      console.log(`✅ Reflection complete: ${taskUpdates.added_count} tasks added, ${taskUpdates.decomposed_count} tasks decomposed`);

      return {
        success: true,
        result: {
          task_updates: taskUpdates,
          ResearchStateUpdate: {
            task_queue: taskUpdates.updated_queue,
            last_reflection: new Date().toISOString(),
            reflection_trigger: "manual",
            updated_at: new Date().toISOString()
          }
        },
        should_continue: true,
        tokens_used: taskUpdates.tokens_used || 0
      };

    } catch (error) {
      console.error("❌ Reflection failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        should_continue: true
      };
    }
  }

  /**
   * Core thinking function: analyze current state and update tasks
   */
  private async thinkAndUpdateTasks(
    context: ExecutionContext, 
    action: string
  ): Promise<any> {
    const prompt = ChatPromptTemplate.fromTemplate(`
You are helping generate character cards and worldbooks. Look at the current situation and think about what tasks need to be done.

CURRENT STATE:
Main Objective: {main_objective}

EXISTING TASK QUEUE:
{task_queue_status}

KNOWLEDGE GAPS:
{knowledge_gaps}

PROGRESS:
- Search Coverage: {search_coverage}%
- Information Quality: {information_quality}%
- Answer Confidence: {answer_confidence}%

INSTRUCTIONS:
Think about what's missing or what tasks are too complex. Then either:
1. Add new specific tasks that are needed
2. Break down existing complex tasks into smaller sub-tasks
3. Both if needed

ACTION PREFERENCE: {action}

Return your thinking and task updates in JSON format:
{{
  "thinking": "your analysis of what's needed",
  "new_tasks": [
    {{
      "description": "specific new task description", 
      "priority": 1-10,
      "reasoning": "why this task is needed"
    }}
  ],
  "decompose_tasks": [
    {{
      "original_task_id": "task_id_to_decompose",
      "sub_tasks": [
        {{
          "description": "sub-task description",
          "priority": 1-10,
          "reasoning": "why this sub-task is needed"
        }}
      ]
    }}
  ]
}}
    `);

    const llm = this.createLLM(context.llm_config);
    const chain = prompt.pipe(llm).pipe(new StringOutputParser());

    const response = await chain.invoke({
      main_objective: context.research_state.main_objective,
      task_queue_status: this.buildTaskQueueStatus(context),
      knowledge_gaps: context.research_state.knowledge_gaps?.join(", ") || "Unknown",
      search_coverage: context.research_state.progress?.search_coverage.toString() || "0",
      information_quality: context.research_state.progress?.information_quality.toString() || "0",
      answer_confidence: context.research_state.progress?.answer_confidence.toString() || "0",
      action: action
    });

    const thinking = this.parseJSONResponse(response);
    
    // Apply the thinking to update task queue
    return this.applyTaskUpdates(context, thinking);
  }

  /**
   * Apply thinking results to update the task queue
   */
  private async applyTaskUpdates(context: ExecutionContext, thinking: any): Promise<any> {
    const currentQueue = context.research_state.task_queue || [];
    const newQueue = [...currentQueue];
    
    let addedCount = 0;
    let decomposedCount = 0;

    // Add new tasks
    if (thinking.new_tasks && thinking.new_tasks.length > 0) {
      for (const newTask of thinking.new_tasks) {
        const task: TaskEntry = {
          id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          description: newTask.description,
          priority: newTask.priority || 5,
          status: "pending",
          reasoning: newTask.reasoning || "Added during reflection"
        };
        newQueue.push(task);
        addedCount++;
      }
    }

    // Decompose existing tasks
    if (thinking.decompose_tasks && thinking.decompose_tasks.length > 0) {
      for (const decomposition of thinking.decompose_tasks) {
        const originalTask = newQueue.find(t => 
          t.id === decomposition.original_task_id || 
          t.description.toLowerCase().includes(decomposition.original_task_id.toLowerCase())
        );
        
        if (originalTask && decomposition.sub_tasks && decomposition.sub_tasks.length > 0) {
          // Mark original task as decomposed
          originalTask.status = "obsolete";
          originalTask.reasoning = "Decomposed into sub-tasks during reflection";
          
          // Add sub-tasks
          for (const subTask of decomposition.sub_tasks) {
            const task: TaskEntry = {
              id: `subtask_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              description: subTask.description,
              priority: subTask.priority || originalTask.priority,
              status: "pending",
              parent_task_id: originalTask.id,
              reasoning: subTask.reasoning || "Sub-task from decomposition"
            };
            newQueue.push(task);
            addedCount++;
          }
          decomposedCount++;
        }
      }
    }

    return {
      updated_queue: newQueue,
      added_count: addedCount,
      decomposed_count: decomposedCount,
      thinking: thinking.thinking,
      summary: `Added ${addedCount} new tasks, decomposed ${decomposedCount} complex tasks`
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private buildTaskQueueStatus(context: ExecutionContext): string {
    const queue = context.research_state.task_queue || [];
    const pending = queue.filter(t => t.status === "pending");
    const active = queue.filter(t => t.status === "active");
    const completed = queue.filter(t => t.status === "completed");
    
    if (queue.length === 0) {
      return "No tasks in queue yet";
    }
    
    const summary = [`Total: ${queue.length} tasks`];
    
    if (pending.length > 0) {
      summary.push(`Pending (${pending.length}): ${pending.slice(0, 3).map(t => `"${t.description}"`).join(", ")}${pending.length > 3 ? "..." : ""}`);
    }
    
    if (active.length > 0) {
      summary.push(`Active (${active.length}): ${active.map(t => `"${t.description}"`).join(", ")}`);
    }
    
    if (completed.length > 0) {
      summary.push(`Completed (${completed.length})`);
    }
    
    return summary.join("\n");
  }
} 