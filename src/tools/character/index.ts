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
  readonly description = "Update or add one or more character fields to build the character card incrementally";
  
  readonly parameters: ToolParameter[] = [
    {
      name: "character_updates",
      type: "object",
      description: "Object containing character fields to update or add. Can contain any combination of character fields.",
      required: true,
      properties: {
        name: {
          type: "string",
          description: "Character's name - the primary identifier"
        },
        description: {
          type: "string", 
          description: "Physical appearance and basic character description"
        },
        personality: {
          type: "string",
          description: "Character's personality traits, behavior patterns, and psychological profile"
        },
        scenario: {
          type: "string",
          description: "The setting, situation, or context where the character exists"
        },
        first_mes: {
          type: "string",
          description: "Character's first message or introduction dialogue"
        },
        mes_example: {
          type: "string", 
          description: "Example dialogue showing the character's speaking style and mannerisms"
        },
        creator_notes: {
          type: "string",
          description: "Additional notes about the character's background, motivations, or usage guidelines"
        },
        avatar: {
          type: "string",
          description: "URL or path to character's avatar image"
        },
        alternate_greetings: {
          type: "array",
          description: "Array of alternative greeting messages the character can use"
        },
        tags: {
          type: "array", 
          description: "Tags categorizing the character (genre, traits, themes, etc.)"
        },
        background: {
          type: "object",
          description: "Detailed background information including history, relationships, skills, etc."
        }
      }
    }
  ];

  protected async doWork(parameters: Record<string, any>, context: ExecutionContext): Promise<ExecutionResult> {
    const characterUpdates = parameters.character_updates;

    if (!characterUpdates || typeof characterUpdates !== 'object') {
      return this.createFailureResult("CHARACTER tool requires 'character_updates' parameter as an object.");
    }
    
    return this.createSuccessResult({
      character_data: characterUpdates,
    });
  }

}