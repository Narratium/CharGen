import { 
  ToolType, 
  ExecutionContext, 
  ExecutionResult 
} from "../../models/agent-model";
import { BaseSimpleTool, ToolParameter } from "../base-tool";

/**
 * User Setting Tool - Creates the mandatory USER_SETTING worldbook entry
 * USER_SETTING entry provides comprehensive player character profiling with multi-dimensional information
 */
export class UserSettingTool extends BaseSimpleTool {
  readonly toolType = ToolType.USER_SETTING;
  readonly name = "USER_SETTING";
  readonly description = "Create the mandatory USER_SETTING worldbook entry that provides comprehensive player character profiling with multi-dimensional information: basic info, appearance, personality layers (surface vs inner), life circumstances, special experiences, abilities, current state, hierarchical organization, timeline integration, psychological depth, systematic ability description, dynamic character arc, world integration, and behavioral framework. This is one of the 3 required essential entries.";
  
  readonly parameters: ToolParameter[] = [
    {
      name: "content",
      type: "string",
      description: "Comprehensive USER_SETTING entry content (500-1500 words) wrapped in <user_setting></user_setting> XML tags with Markdown formatting inside. Must include: multi-dimensional player character info with hierarchical organization (main categories → subcategories → specific items → detailed descriptions), timeline integration, psychological depth (surface vs inner personality), systematic ability descriptions, dynamic character arc (past → current → future), world integration, and behavioral framework. Use detailed descriptions with specific examples.",
      required: true
    },
    {
      name: "comment",
      type: "string",
      description: "Must be exactly 'USER_SETTING' to identify this as the user setting entry",
      required: true
    }
  ];

  protected async doWork(parameters: Record<string, any>, context: ExecutionContext): Promise<ExecutionResult> {
    const content = parameters.content;
    const comment = parameters.comment;
    
    if (!content || typeof content !== 'string') {
      return this.createFailureResult("USER_SETTING tool requires 'content' parameter as a string.");
    }

    if (!comment || comment.toUpperCase() !== 'USER_SETTING') {
      return this.createFailureResult("USER_SETTING tool requires 'comment' parameter to be exactly 'USER_SETTING'.");
    }

    // Validate content has proper XML wrapper
    if (!content.includes('<user_setting>') || !content.includes('</user_setting>')) {
      return this.createFailureResult("USER_SETTING entry content must be wrapped in <user_setting></user_setting> XML tags.");
    }

    // Build the USER_SETTING worldbook entry with fixed configuration
    const entry = {
      id: `wb_user_setting_${Date.now()}`,
      uid: (1100 + Math.floor(Math.random() * 1000)).toString(),
      key: ["user", "player", "character", "protagonist", "you"], // Fixed keywords for USER_SETTING
      keysecondary: ["yourself", "personal", "background"],
      comment: "USER_SETTING",
      content: content,
      constant: true, // Always active
      selective: true,
      insert_order: 2, // Second priority
      position: 0, // At story beginning
      disable: false,
      probability: 100,
      useProbability: true
    };

    console.log(`✅ Created USER_SETTING entry with ${content.length} characters`);

    return this.createSuccessResult({
      worldbook_data: [entry],
    });
  }
} 