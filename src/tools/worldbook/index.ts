import { 
  ToolType, 
  ExecutionContext, 
  ExecutionResult 
} from "../../models/agent-model";
import { BaseSimpleTool, ToolParameter } from "../base-tool";

/**
 * Worldbook Tool - Pure Execution Unit
 * Handles worldbook generation based on provided parameters from planner
 * Creates comprehensive worldbook entries with substantial content using XML outer structure and Markdown inner format
 */
export class WorldbookTool extends BaseSimpleTool {
  readonly toolType = ToolType.WORLDBOOK;
  readonly name = "WORLDBOOK";
  readonly description = "Generate comprehensive worldbook entries with substantial content (500-1500 words each) to enhance storytelling. Use ONLY AFTER character creation is 100% complete. ESSENTIAL ENTRIES REQUIRED: STATUS (1), USER_SETTING (1), WORLD_VIEW (1). SUPPLEMENTARY ENTRIES: Minimum 5 additional entries based on WORLD_VIEW hierarchical structure. Content format: XML outer wrapper with Markdown internal formatting for rich, detailed descriptions.";
  
  readonly parameters: ToolParameter[] = [
    {
      name: "key",
      type: "array",
      description: "Array of primary trigger keywords that activate this worldbook entry when mentioned in conversation. Choose common, natural words that users would likely use when discussing this topic. Keywords should be broad enough to catch relevant context but specific enough to avoid false triggers (e.g., for magic system: ['magic', 'spell', 'mana', 'enchantment', 'wizard'])",
      required: true
    },
    {
      name: "content",
      type: "string",
      description: "Substantial worldbook content (500-1500 words) with rich details. For ESSENTIAL entries: Use appropriate XML wrapper (e.g., <status>content</status>, <user_setting>content</user_setting>, <world_view>content</world_view>) with Markdown formatting inside. For SUPPLEMENTARY entries: Use detailed Markdown formatting with headers, lists, and comprehensive descriptions that expand on WORLD_VIEW hierarchical elements.",
      required: true
    },
    {
      name: "comment",
      type: "string",
      description: "Brief description categorizing this entry. ESSENTIAL TYPES: 'STATUS', 'USER_SETTING', 'WORLD_VIEW'. SUPPLEMENTARY TYPES: describe specific elements from WORLD_VIEW (e.g., 'Faction: Shadow Guild', 'Location: Crystal Academy', 'System: Magic Cultivation', 'NPC: Elder Master Chen')",
      required: true
    },
    {
      name: "keysecondary",
      type: "array",
      description: "Array of secondary trigger keywords (optional)",
      required: false
    },
    {
      name: "constant",
      type: "boolean",
      description: "Whether this entry should always be active. Use TRUE for ESSENTIAL entries (STATUS, USER_SETTING, WORLD_VIEW) and important global information. Use FALSE (default) for SUPPLEMENTARY entries that appear in specific contexts.",
      required: false
    },
    {
      name: "position",
      type: "number",
      description: "Controls where this worldbook entry is inserted in the AI conversation context. ESSENTIAL entries (STATUS, USER_SETTING, WORLD_VIEW): use 0-1 for foundational positioning. SUPPLEMENTARY entries: use 2-3 for contextual relevance. Values: 0-1 (at story beginning), 2 (at story end), 3 (before user input), 4 (after user input). Default: 0",
      required: false
    },
    {
      name: "order",
      type: "number",
      description: "Processing priority order. ESSENTIAL entries: 1-3 (STATUS=1, USER_SETTING=2, WORLD_VIEW=3). SUPPLEMENTARY entries: 10+ for proper ordering. Default: 100",
      required: false
    },
  ];

  protected async doWork(parameters: Record<string, any>, context: ExecutionContext): Promise<ExecutionResult> {
    const key = parameters.key;
    const content = parameters.content;
    const comment = parameters.comment;
    
    if (!key) {
      return this.createFailureResult("WORLDBOOK tool requires 'key' parameter.");
    }

    // Handle key parameter - support both array and comma-separated string
    let keyArray: string[];
    if (Array.isArray(key)) {
      keyArray = key.filter((k: string) => k && k.trim().length > 0);
    } else if (typeof key === 'string') {
      keyArray = key.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0);
    } else {
      return this.createFailureResult("WORLDBOOK tool requires 'key' parameter as an array or comma-separated string.");
    }

    if (!content || typeof content !== 'string') {
      return this.createFailureResult("WORLDBOOK tool requires 'content' parameter as a string.");
    }

    if (!comment || typeof comment !== 'string') {
      return this.createFailureResult("WORLDBOOK tool requires 'comment' parameter as a string.");
    }

    // Handle keysecondary parameter - support both array and comma-separated string
    let keysecondaryArray: string[] = [];
    if (parameters.keysecondary) {
      if (Array.isArray(parameters.keysecondary)) {
        keysecondaryArray = parameters.keysecondary.filter((k: string) => k && k.trim().length > 0);
      } else if (typeof parameters.keysecondary === 'string') {
        keysecondaryArray = parameters.keysecondary.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 0);
      }
    }

    // Determine if this is an essential entry and set appropriate defaults
    const isEssentialEntry = ['STATUS', 'USER_SETTING', 'WORLD_VIEW'].includes(comment.toUpperCase());
    const defaultConstant = isEssentialEntry;
    const defaultOrder = isEssentialEntry ? 
      (comment.toUpperCase() === 'STATUS' ? 1 : 
       comment.toUpperCase() === 'USER_SETTING' ? 2 : 
       comment.toUpperCase() === 'WORLD_VIEW' ? 3 : 100) : 100;

    // Build the worldbook entry
    const entry = {
      id: `wb_entry_${Date.now()}`,
      uid: (1000 + Math.floor(Math.random() * 1000)).toString(),
      key: keyArray,
      keysecondary: keysecondaryArray,
      comment: comment,
      content: content,
      constant: parameters.constant !== undefined ? parameters.constant : defaultConstant,
      selective: true,
      order: parameters.order || defaultOrder,
      position: parameters.position !== undefined ? parameters.position : (isEssentialEntry ? 0 : 2),
      disable: false,
      probability: 100,
      useProbability: true
    };

    return this.createSuccessResult({
      worldbook_data: [entry],
    });
  }

}