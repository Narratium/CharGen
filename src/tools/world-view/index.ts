import { 
  ToolType, 
  ExecutionContext, 
  ExecutionResult 
} from "../../models/agent-model";
import { BaseSimpleTool, ToolParameter } from "../base-tool";

/**
 * World View Tool - Creates the mandatory WORLD_VIEW worldbook entry
 * WORLD_VIEW entry provides comprehensive world structure with hierarchical framework for all supplementary entries
 */
export class WorldViewTool extends BaseSimpleTool {
  readonly toolType = ToolType.WORLD_VIEW;
  readonly name = "WORLD_VIEW";
  readonly description = "Create the mandatory WORLD_VIEW worldbook entry that provides comprehensive world structure with hierarchical framework. This serves as the foundation for all supplementary entries and must include: world overview, major systems, geographical structure, power/magic systems, societal structure, technological level, cultural aspects, historical context, and hierarchical organization that guides what supplementary entries to create. This is one of the 3 required essential entries.";
  
  readonly parameters: ToolParameter[] = [
    {
      name: "content",
      type: "string",
      description: "Comprehensive WORLD_VIEW entry content (500-1500 words) wrapped in <world_view></world_view> XML tags with Markdown formatting inside. Must include: world overview, major systems (magic/tech/power), geographical structure, societal framework, cultural aspects, historical context, and most importantly - hierarchical organization that clearly defines what types of supplementary entries should be created (locations, characters, systems, factions, etc.). Use detailed descriptions with specific examples and clear categorization.",
      required: true
    },
    {
      name: "comment",
      type: "string",
      description: "Must be exactly 'WORLD_VIEW' to identify this as the world view entry",
      required: true
    }
  ];

  protected async doWork(parameters: Record<string, any>, context: ExecutionContext): Promise<ExecutionResult> {
    const content = parameters.content;
    const comment = parameters.comment;
    
    if (!content || typeof content !== 'string') {
      return this.createFailureResult("WORLD_VIEW tool requires 'content' parameter as a string.");
    }

    if (!comment || comment.toUpperCase() !== 'WORLD_VIEW') {
      return this.createFailureResult("WORLD_VIEW tool requires 'comment' parameter to be exactly 'WORLD_VIEW'.");
    }

    // Validate content has proper XML wrapper
    if (!content.includes('<world_view>') || !content.includes('</world_view>')) {
      return this.createFailureResult("WORLD_VIEW entry content must be wrapped in <world_view></world_view> XML tags.");
    }

    // Build the WORLD_VIEW worldbook entry with fixed configuration
    const entry = {
      id: `wb_world_view_${Date.now()}`,
      uid: (1200 + Math.floor(Math.random() * 1000)).toString(),
      key: ["world", "universe", "realm", "setting", "reality"], // Fixed keywords for WORLD_VIEW
      keysecondary: ["lore", "background", "structure", "system"],
      comment: "WORLD_VIEW",
      content: content,
      constant: true, // Always active
      selective: true,
      insert_order: 3, // Third priority after STATUS and USER_SETTING
      position: 0, // At story beginning
      disable: false,
      probability: 100,
      useProbability: true
    };

    console.log(`✅ Created WORLD_VIEW entry with ${content.length} characters`);

    return this.createSuccessResult({
      worldbook_data: [entry],
    });
  }
} 