import { 
  ToolType, 
  ExecutionContext, 
  ExecutionResult 
} from "../../models/agent-model";
import { BaseSimpleTool, ToolParameter } from "../base-tool";

/**
 * Status Tool - Creates the mandatory STATUS worldbook entry
 * STATUS entry provides comprehensive real-time information about the current world state
 */
export class StatusTool extends BaseSimpleTool {
  readonly toolType = ToolType.STATUS;
  readonly name = "STATUS";
  readonly description = "Create the mandatory STATUS worldbook entry that provides comprehensive real-time information including temporal context, spatial context, environmental data, character statistics, physical information, interactive elements, visual structure with symbols and organized data presentation, and dynamic elements that change based on story progression. This is one of the 3 required essential entries.";
  
  readonly parameters: ToolParameter[] = [
    {
      name: "content",
      type: "string",
      description: "Comprehensive STATUS entry content (500-1500 words) wrapped in <status></status> XML tags with Markdown formatting inside. Must include: temporal context, spatial context, environmental data, character statistics, physical information, interactive elements, visual structure with symbols, and dynamic elements. Use detailed descriptions with specific examples and organized data presentation.",
      required: true
    },
    {
      name: "comment",
      type: "string", 
      description: "Must be exactly 'STATUS' to identify this as the status entry",
      required: true
    }
  ];

  protected async doWork(parameters: Record<string, any>, context: ExecutionContext): Promise<ExecutionResult> {
    const content = parameters.content;
    const comment = parameters.comment;
    
    if (!content || typeof content !== 'string') {
      return this.createFailureResult("STATUS tool requires 'content' parameter as a string.");
    }

    if (!comment || comment.toUpperCase() !== 'STATUS') {
      return this.createFailureResult("STATUS tool requires 'comment' parameter to be exactly 'STATUS'.");
    }

    // Validate content has proper XML wrapper
    if (!content.includes('<status>') || !content.includes('</status>')) {
      return this.createFailureResult("STATUS entry content must be wrapped in <status></status> XML tags.");
    }

    // Build the STATUS worldbook entry with fixed configuration
    const entry = {
      id: `wb_status_${Date.now()}`,
      uid: (1000 + Math.floor(Math.random() * 1000)).toString(),
      key: ["status", "current", "state", "condition", "situation"], // Fixed keywords for STATUS
      keysecondary: ["info", "update", "check"],
      comment: "STATUS",
      content: content,
      constant: true, // Always active
      selective: true,
      insert_order: 1, // Highest priority
      position: 0, // At story beginning
      disable: false,
      probability: 100,
      useProbability: true
    };

    console.log(`✅ Created STATUS entry with ${content.length} characters`);

    return this.createSuccessResult({
      worldbook_data: [entry],
    });
  }
} 