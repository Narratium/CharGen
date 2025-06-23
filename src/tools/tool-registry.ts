import { ToolType, ToolExecutionContext, ToolExecutionResult, PlanTask } from "../models/agent-model";
import { BaseTool } from "./base-tool";
import { PlanTool } from "./plan";
import { AskUserTool } from "./ask-user";
import { SearchTool } from "./search";
import { OutputTool } from "./output";

/**
 * Tool Registry - manages all available tools
 */
export class ToolRegistry {
  private static tools: Map<ToolType, BaseTool> = new Map();
  private static initialized = false;

  /**
   * Initialize and register all tools
   */
  static initialize(): void {
    if (this.initialized) return;

    this.tools.set(ToolType.PLAN, new PlanTool());
    this.tools.set(ToolType.ASK_USER, new AskUserTool());
    this.tools.set(ToolType.SEARCH, new SearchTool());
    this.tools.set(ToolType.OUTPUT, new OutputTool());
    this.initialized = true;
  }

  /**
   * Get tool by type
   */
  static getTool(toolType: ToolType): BaseTool | undefined {
    this.initialize();
    return this.tools.get(toolType);
  }

  /**
   * Get all available tools
   */
  static getAllTools(): BaseTool[] {
    this.initialize();
    return Array.from(this.tools.values());
  }

  /**
   * Get tool information for LLM prompts
   */
  static getToolsInfo(): Array<{ type: string; name: string; description: string }> {
    this.initialize();
    return this.getAllTools().map(tool => tool.getToolInfo());
  }

  /**
   * Execute a task with the appropriate tool
   */
  static async executeTask(task: PlanTask, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const tool = this.getTool(task.tool);
    if (!tool) {
      return {
        success: false,
        error: `No tool found for type: ${task.tool}`,
        should_continue: true,
      };
    }

    if (!tool.canExecute(task)) {
      return {
        success: false,
        error: `Tool ${task.tool} cannot execute this task`,
        should_continue: true,
      };
    }

    return await tool.executeTask(task, context);
  }

  /**
   * Register a custom tool
   */
  static registerTool(tool: BaseTool): void {
    this.tools.set(tool.toolType, tool);
  }

  /**
   * Unregister a tool
   */
  static unregisterTool(toolType: ToolType): boolean {
    return this.tools.delete(toolType);
  }
}

// Auto-initialize the registry
ToolRegistry.initialize(); 
 
