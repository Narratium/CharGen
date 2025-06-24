import { ToolType, BaseToolContext, PlanToolContext, ToolExecutionResult, PlanTask } from "../models/agent-model";
import { Tool, RegularTool, PlanTool as PlanToolInterface } from "./base-tool";
import { PlanTool } from "./plan";
import { AskUserTool } from "./ask-user";
import { SearchTool } from "./search";
import { OutputTool } from "./output";

/**
 * Tool Registry - Simplified for new tool architecture
 * 工具注册表 - 为新的工具架构简化
 */
export class ToolRegistry {
  private static regularTools: Map<ToolType, RegularTool> = new Map();
  private static planTools: Map<ToolType, PlanToolInterface> = new Map();
  private static initialized = false;

  /**
   * Initialize and register all tools
   */
  static initialize(): void {
    if (this.initialized) return;

    // Register regular tools
    this.regularTools.set(ToolType.ASK_USER, new AskUserTool());
    this.regularTools.set(ToolType.SEARCH, new SearchTool());
    this.regularTools.set(ToolType.OUTPUT, new OutputTool());

    // Register plan tools
    this.planTools.set(ToolType.PLAN, new PlanTool());

    this.initialized = true;
  }

  /**
   * Get tool by type
   */
  static getTool(toolType: ToolType): Tool | undefined {
    this.initialize();
    return this.regularTools.get(toolType) || this.planTools.get(toolType);
  }

  /**
   * Get regular tool by type
   */
  static getRegularTool(toolType: ToolType): RegularTool | undefined {
    this.initialize();
    return this.regularTools.get(toolType);
  }

  /**
   * Get plan tool by type
   */
  static getPlanTool(toolType: ToolType): PlanToolInterface | undefined {
    this.initialize();
    return this.planTools.get(toolType);
  }

  /**
   * Get all available tools
   */
  static getAllTools(): Tool[] {
    this.initialize();
    return [
      ...Array.from(this.regularTools.values()),
      ...Array.from(this.planTools.values())
    ];
  }

  /**
   * Get tool information for LLM prompts
   */
  static getToolsInfo(): Array<{ type: string; name: string; description: string }> {
    this.initialize();
    return this.getAllTools().map(tool => ({
      type: tool.toolType,
      name: tool.name,
      description: tool.description,
    }));
  }

  /**
   * Execute a task with the appropriate tool and context
   * 使用适当的工具和上下文执行任务
   */
  static async executeTask(
    task: PlanTask, 
    context: BaseToolContext | PlanToolContext
  ): Promise<ToolExecutionResult> {
    this.initialize();

    try {
      // Route to appropriate tool type
      if (task.tool === ToolType.PLAN) {
        // PLAN tools require PlanToolContext
        const planTool = this.planTools.get(task.tool);
        if (!planTool) {
          return {
            success: false,
            error: `No plan tool found for type: ${task.tool}`,
            should_continue: true,
          };
        }

        if (!planTool.canHandle(task)) {
          return {
            success: false,
            error: `Plan tool ${task.tool} cannot handle this task`,
            should_continue: true,
          };
        }

        // Ensure we have PlanToolContext
        if (!('planning_context' in context)) {
          return {
            success: false,
            error: `Plan tool requires PlanToolContext but received BaseToolContext`,
            should_continue: true,
          };
        }

        console.log(`🎯 [${planTool.name}] Executing: ${task.description}`);
        const result = await planTool.execute(context as PlanToolContext);
        
        return {
          success: true,
          result,
          should_continue: true,
          reasoning: `${planTool.name} completed successfully`
        };

      } else {
        // Regular tools use BaseToolContext
        const regularTool = this.regularTools.get(task.tool);
        if (!regularTool) {
          return {
            success: false,
            error: `No regular tool found for type: ${task.tool}`,
            should_continue: true,
          };
        }

        if (!regularTool.canHandle(task)) {
          return {
            success: false,
            error: `Regular tool ${task.tool} cannot handle this task`,
            should_continue: true,
          };
        }

        // Extract BaseToolContext for regular tools
        const baseContext: BaseToolContext = {
          conversation_id: context.conversation_id,
          task_progress: context.task_progress,
          conversation_history: context.conversation_history,
          llm_config: context.llm_config,
        };

        console.log(`🔧 [${regularTool.name}] Executing: ${task.description}`);
        const result = await regularTool.execute(baseContext);

        return {
          success: true,
          result,
          should_continue: true,
          reasoning: `${regularTool.name} completed successfully`
        };
      }
    } catch (error) {
      console.error(`❌ Tool execution failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        should_continue: true,
        reasoning: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Check if a tool type is a plan tool
   */
  static isPlanTool(toolType: ToolType): boolean {
    this.initialize();
    return this.planTools.has(toolType);
  }

  /**
   * Check if a tool type is a regular tool
   */
  static isRegularTool(toolType: ToolType): boolean {
    this.initialize();
    return this.regularTools.has(toolType);
  }

  /**
   * Register a custom regular tool
   */
  static registerRegularTool(tool: RegularTool): void {
    this.initialize();
    this.regularTools.set(tool.toolType, tool);
  }

  /**
   * Register a custom plan tool
   */
  static registerPlanTool(tool: PlanToolInterface): void {
    this.initialize();
    this.planTools.set(tool.toolType, tool);
  }

  /**
   * Unregister a tool
   */
  static unregisterTool(toolType: ToolType): boolean {
    this.initialize();
    return this.regularTools.delete(toolType) || this.planTools.delete(toolType);
  }

  /**
   * Get registry statistics
   */
  static getStats(): {
    totalTools: number;
    regularTools: number;
    planTools: number;
    toolTypes: string[];
  } {
    this.initialize();
    return {
      totalTools: this.regularTools.size + this.planTools.size,
      regularTools: this.regularTools.size,
      planTools: this.planTools.size,
      toolTypes: [
        ...Array.from(this.regularTools.keys()),
        ...Array.from(this.planTools.keys())
      ],
    };
  }
}

// Auto-initialize the registry
ToolRegistry.initialize(); 
 
