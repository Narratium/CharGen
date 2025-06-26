import { 
  ToolType, 
  ExecutionContext, 
  ExecutionResult, 
  ToolDecision 
} from "../models/agent-model";
import { SimpleTool } from "./base-tool";
import { SearchTool } from "./search";
import { AskUserTool } from "./ask-user";
import { OutputTool } from "./output";

/**
 * Simplified Tool Registry - Real-time Decision Architecture
 * No more complex tool planning, just direct tool execution
 */
export class ToolRegistry {
  private static tools: Map<ToolType, SimpleTool> = new Map();
  private static initialized = false;

  /**
   * Initialize and register all tools
   */
  static initialize(): void {
    if (this.initialized) return;

    // Register simplified tools
    this.tools.set(ToolType.SEARCH, new SearchTool());
    this.tools.set(ToolType.ASK_USER, new AskUserTool());
    this.tools.set(ToolType.OUTPUT, new OutputTool());

    this.initialized = true;
    console.log("🔧 Tool Registry initialized with 3 tools");
  }

  /**
   * Execute a tool decision - the core method for real-time execution
   */
  static async executeToolDecision(
    decision: ToolDecision, 
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    this.initialize();

    const tool = this.tools.get(decision.tool);
    if (!tool) {
      return {
        success: false,
        error: `No tool found for type: ${decision.tool}`,
        should_continue: true,
      };
    }

    console.log(`🛠️ [${tool.name}] Executing with parameters:`, decision.parameters);
    
    try {
      const result = await tool.execute(context, decision.parameters);
      
      console.log(`✅ [${tool.name}] ${result.success ? 'Success' : 'Failed'}`);
      if (result.error) {
        console.log(`❌ Error: ${result.error}`);
      }
      
      return result;
    } catch (error) {
      console.error(`❌ [${tool.name}] Execution failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        should_continue: true,
      };
    }
  }

  /**
   * Get tool by type
   */
  static getTool(toolType: ToolType): SimpleTool | undefined {
    this.initialize();
    return this.tools.get(toolType);
  }

  /**
   * Get all available tools
   */
  static getAllTools(): SimpleTool[] {
    this.initialize();
    return Array.from(this.tools.values());
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
   * Check if a tool type is available
   */
  static hasToolType(toolType: ToolType): boolean {
    this.initialize();
    return this.tools.has(toolType);
  }

  /**
   * Register a custom tool
   */
  static registerTool(tool: SimpleTool): void {
    this.initialize();
    this.tools.set(tool.toolType, tool);
    console.log(`🔧 Registered custom tool: ${tool.name}`);
  }

  /**
   * Unregister a tool
   */
  static unregisterTool(toolType: ToolType): boolean {
    this.initialize();
    const removed = this.tools.delete(toolType);
    if (removed) {
      console.log(`🗑️ Unregistered tool: ${toolType}`);
    }
    return removed;
  }

  /**
   * Get registry statistics
   */
  static getStats(): {
    totalTools: number;
    toolTypes: string[];
  } {
    this.initialize();
    return {
      totalTools: this.tools.size,
      toolTypes: Array.from(this.tools.keys()),
    };
  }

  /**
   * Get detailed tool information with parameters for LLM planning
   */
  static getDetailedToolsInfo(): Array<{
    type: string;
    name: string;
    description: string;
    parameters: Array<{
      name: string;
      type: string;
      description: string;
      required: boolean;
      default?: any;
      options?: string[];
    }>;
  }> {
    this.initialize();
    return this.getAllTools().map(tool => ({
      type: tool.toolType,
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }
}

// Auto-initialize the registry
ToolRegistry.initialize(); 
 
