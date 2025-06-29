import { 
  ToolType, 
  ExecutionContext, 
  ExecutionResult 
} from "../../models/agent-model";
import { BaseSimpleTool, ToolParameter } from "../base-tool";

/**
 * Character Tool - Pure Execution Unit
 * Updates or adds one or more character fields to the character card data
 * Can be used incrementally to build up the character over multiple tool calls
 */
export class CharacterTool extends BaseSimpleTool {
  readonly toolType = ToolType.CHARACTER;
  readonly name = "CHARACTER";
  readonly description = "Generate or update character card data - one of the most frequently used tools. Build character incrementally by adding fields in logical order: start with basic info (name, description), then personality, scenario, dialogue examples, and finally details like creator notes and tags. CHARACTER generation should typically be completed BEFORE starting worldbook creation, as worldbook entries should complement and enhance the established character.";
  
  readonly parameters: ToolParameter[] = [
    {
      name: "name",
      type: "string",
      description: "Character's name - the primary identifier",
      required: false
    },
    {
      name: "description",
      type: "string", 
      description: "Physical appearance and basic character description",
      required: false
    },
    {
      name: "personality",
      type: "string",
      description: "Character's personality traits, behavior patterns, and psychological profile",
      required: false
    },
    {
      name: "scenario",
      type: "string",
      description: "The setting, situation, or context where the character exists",
      required: false
    },
    {
      name: "first_mes",
      type: "string",
      description: "Character's first message or introduction dialogue",
      required: false
    },
    {
      name: "mes_example",
      type: "string", 
      description: "Example dialogue showing the character's speaking style and mannerisms",
      required: false
    },
    {
      name: "creator_notes",
      type: "string",
      description: "Additional notes about the character's background, motivations, or usage guidelines",
      required: false
    },
    {
      name: "tags",
      type: "array", 
      description: "Array of tags categorizing the character (e.g., ['fantasy', 'sorceress', 'mysterious'])",
      required: false
    }
  ];

  protected async doWork(parameters: Record<string, any>, context: ExecutionContext): Promise<ExecutionResult> {
    // Filter out undefined/null parameters and build character data
    const characterUpdates: any = {};
    
    if (parameters.name) characterUpdates.name = parameters.name;
    if (parameters.description) characterUpdates.description = parameters.description;
    if (parameters.personality) characterUpdates.personality = parameters.personality;
    if (parameters.scenario) characterUpdates.scenario = parameters.scenario;
    if (parameters.first_mes) characterUpdates.first_mes = parameters.first_mes;
    if (parameters.mes_example) characterUpdates.mes_example = parameters.mes_example;
    if (parameters.creator_notes) characterUpdates.creator_notes = parameters.creator_notes;
    if (parameters.tags) {
      // Support both array and comma-separated string formats
      if (Array.isArray(parameters.tags)) {
        characterUpdates.tags = parameters.tags.filter((tag: string) => tag && tag.trim().length > 0);
      } else if (typeof parameters.tags === 'string') {
        // Convert comma-separated string to array for backward compatibility
        characterUpdates.tags = parameters.tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag.length > 0);
      }
    }

    if (Object.keys(characterUpdates).length === 0) {
      return this.createFailureResult("CHARACTER tool requires at least one character field to be provided.");
    }
    
    return this.createSuccessResult({
      character_data: characterUpdates,
    });
  }

}