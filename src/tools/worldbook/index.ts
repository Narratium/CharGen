import { 
  ToolType, 
  ExecutionContext, 
  ExecutionResult 
} from "../../models/agent-model";
import { BaseSimpleTool, ToolParameter } from "../base-tool";

/**
 * Worldbook Tool - Pure Execution Unit
 * Handles worldbook generation metadata based on provided parameters from planner
 * Actual content generation is handled by AgentEngine
 */
export class WorldbookTool extends BaseSimpleTool {
  readonly toolType = ToolType.WORLDBOOK;
  readonly name = "WORLDBOOK";
  readonly description = "Generate worldbook entries to enhance storytelling - one of the most frequently used tools. Use AFTER character creation is substantially complete. Create entries systematically: start with character relationships and background, then world information, rules, and supporting elements. Build worldbook incrementally, adding 1-3 high-quality entries per call that complement the established character and story setting.";
  
  readonly parameters: ToolParameter[] = [
    {
      name: "key",
      type: "string",
      description: "Comma-separated primary trigger keywords for this worldbook entry (e.g., 'magic, spell, enchantment')",
      required: true
    },
    {
      name: "content",
      type: "string",
      description: "Detailed worldbook content that enhances roleplay and provides context",
      required: true
    },
    {
      name: "comment",
      type: "string",
      description: "Brief description of what this entry covers (for organization)",
      required: true
    },
    {
      name: "keysecondary",
      type: "string",
      description: "Comma-separated secondary trigger keywords (optional)",
      required: false
    },
    {
      name: "constant",
      type: "boolean",
      description: "Whether this entry should always be active (default: false)",
      required: false
    },
    {
      name: "order",
      type: "number",
      description: "Display/processing order priority (default: 100)",
      required: false
    }
  ];

  protected async doWork(parameters: Record<string, any>, context: ExecutionContext): Promise<ExecutionResult> {
    const key = parameters.key;
    const content = parameters.content;
    const comment = parameters.comment;
    
    if (!key || typeof key !== 'string') {
      return this.createFailureResult("WORLDBOOK tool requires 'key' parameter as a string.");
    }

    if (!content || typeof content !== 'string') {
      return this.createFailureResult("WORLDBOOK tool requires 'content' parameter as a string.");
    }

    if (!comment || typeof comment !== 'string') {
      return this.createFailureResult("WORLDBOOK tool requires 'comment' parameter as a string.");
    }

    // Build the worldbook entry
    const entry = {
      id: `wb_entry_${Date.now()}`,
      uid: (1000 + Math.floor(Math.random() * 1000)).toString(),
      key: key.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0),
      keysecondary: parameters.keysecondary ? 
        parameters.keysecondary.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0) : [],
      comment: comment,
      content: content,
      constant: parameters.constant || false,
      selective: true,
      order: parameters.order || 100,
      position: 0,
      disable: false,
      probability: 100,
      useProbability: true
    };

    return this.createSuccessResult({
      worldbook_data: [entry],
    });
  }

}