import { 
  ToolType, 
  ExecutionContext, 
  ExecutionResult,
  SupplementEntry
} from "../../models/agent-model";
import { BaseSimpleTool, ToolParameter } from "../base-tool";
import { v4 as uuidv4 } from 'uuid';

/**
 * Supplement Tool - Creates supplementary worldbook entries
 * SUPPLEMENT entries provide detailed expansions of specific WORLD_VIEW elements
 */
export class SupplementTool extends BaseSimpleTool {
  readonly toolType = ToolType.SUPPLEMENT;
  readonly name = "SUPPLEMENT";
  readonly description = "Create supplementary worldbook entries that provide detailed expansions of specific nouns/entities mentioned in the WORLD_VIEW entry. Each supplement focuses on one particular element (faction, location, technology, character, system, etc.) and provides comprehensive background details not covered in the foundational WORLD_VIEW. Extract keywords from WORLD_VIEW content and create detailed 500-1000 word entries using rich Markdown formatting. Minimum 5 supplementary entries required for complete worldbook.";
  
  readonly parameters: ToolParameter[] = [
    {
      name: "key",
      type: "array",
      description: "Array of trigger keywords extracted from WORLD_VIEW content. Should be specific nouns, names, or entities mentioned in WORLD_VIEW (e.g., faction names like '血十字帮', locations like '美好公寓', technologies like '雪上列车', systems like '冰雪分子能量转化技术'). These keywords will trigger this entry when mentioned in conversation.",
      required: true
    },
    {
      name: "keysecondary",
      type: "array", 
      description: "Optional secondary keywords for more specific or related triggers",
      required: false
    },
    {
      name: "content",
      type: "string",
      description: "Detailed supplementary content (500-1000 words) using rich Markdown formatting. Focus on one specific WORLD_VIEW element and provide comprehensive background, operational details, relationships, and context not covered in the foundational WORLD_VIEW entry. Use headers, lists, and detailed descriptions to create immersive content.",
      required: true
    },
    {
      name: "comment",
      type: "string",
      description: "Descriptive comment identifying the type and subject of this supplementary entry (e.g., 'Faction: Blood Cross Gang', 'Location: Paradise Apartments', 'Technology: Snow Train System', 'Character: Elder Mage')",
      required: true
    },
    {
      name: "insert_order",
      type: "number",
      description: "Priority order for this supplementary entry (should be 10 or higher, with higher numbers for less critical entries)",
      required: false
    }
  ];

  protected async doWork(parameters: Record<string, any>, context: ExecutionContext): Promise<ExecutionResult> {
    const key = parameters.key;
    const keysecondary = parameters.keysecondary || [];
    const content = parameters.content;
    const comment = parameters.comment;
    const insertOrder = parameters.insert_order || 10;
    
    if (!key || !Array.isArray(key) || key.length === 0) {
      return this.createFailureResult("SUPPLEMENT tool requires 'key' parameter as a non-empty array of trigger keywords.");
    }

    if (!content || typeof content !== 'string') {
      return this.createFailureResult("SUPPLEMENT tool requires 'content' parameter as a string.");
    }

    if (!comment || typeof comment !== 'string') {
      return this.createFailureResult("SUPPLEMENT tool requires 'comment' parameter as a descriptive string.");
    }

    // Build the SUPPLEMENT worldbook entry
    const supplementEntry: SupplementEntry = {
      id: `wb_supplement_${Date.now()}`,
      uid: uuidv4(),
      key: key,
      keysecondary: keysecondary,
      comment: comment,
      content: content,
      constant: false, // Context-activated
      selective: true,
      insert_order: Math.max(insertOrder, 10), // Ensure minimum insert_order of 10
      position: 2, // Story end position for contextual activation
      disable: false,
      probability: 100,
      useProbability: true
    };

    console.log(`✅ Created SUPPLEMENT entry '${comment}' with ${content.length} characters, expanding WORLD_VIEW elements`);

    return this.createSuccessResult({
      supplement_data: [supplementEntry],
    });
  }
}