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
  readonly description = "Generate or update character card data - one of the most frequently used tools. Build character incrementally by adding fields in REQUIRED logical order: name → description → personality → scenario → first_mes → mes_example → creator_notes → tags. ALL EIGHT CORE FIELDS ARE REQUIRED for a complete character card. Optional fields like alternate_greetings can be added to enhance player choice. Use multiple tool calls to build systematically, with each call adding one or more fields. CHARACTER generation with all required fields must be completed BEFORE starting worldbook creation, as worldbook entries should complement and enhance the established character.";
  
  readonly parameters: ToolParameter[] = [
    {
      name: "name",
      type: "string",
      description: "The primary identifier - typically the story title, scenario name, or thematic title rather than just a character name. For complex scenarios, use descriptive titles like 'The Enchanted Academy' or 'Cyberpunk Detective Story'. For simple character-focused cards, can be a character name with descriptive prefix like 'Elara the Sorceress'.",
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
      description: "For character-focused cards: personality traits, behavior patterns, and psychological profile. For story/scenario cards: overall story atmosphere, tone, and key NPC personalities (e.g., 'Dark mysterious atmosphere with Professor Magnus (stern mentor), Luna (cheerful student), Marcus (rival)')",
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
      description: "The opening scene or introduction that sets the story in motion. For character cards: character's introduction and first interaction. For story cards: narrative opening that establishes the setting, atmosphere, and initial scenario (e.g., 'The bell rings as you enter the mysterious academy, students whispering about the new transfer student...')",
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
      name: "alternate_greetings",
      type: "array",
      description: "Array of alternative opening scenarios that provide different starting points or worldlines for the story. Each greeting should offer a distinct narrative path, setting variation, or character situation. Examples: ['Summer festival version', 'Library encounter', 'Rainy day meeting', 'Battle aftermath scenario']",
      required: false
    },
    {
      name: "tags",
      type: "array", 
      description: "Array of categorization tags. REQUIRED CATEGORIES: Card Type ['character-card' OR 'story-card']. GENRE OPTIONS: ['fantasy', 'romance', 'sci-fi', 'mystery', 'horror', 'slice-of-life', 'historical', 'modern', 'cyberpunk', 'steampunk', 'urban-fantasy', 'isekai', 'school-life', 'workplace', 'adventure', 'thriller', 'comedy', 'drama', 'supernatural', 'post-apocalyptic']. ADDITIONAL DESCRIPTORS: ['cute', 'dark', 'mature', 'wholesome', 'intense', 'lighthearted', 'serious', 'mysterious', 'action-packed', 'emotional']. Example: ['story-card', 'fantasy', 'school-life', 'mysterious', 'wholesome']",
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
    if (parameters.alternate_greetings) {
      // Support both array and comma-separated string formats
      if (Array.isArray(parameters.alternate_greetings)) {
        characterUpdates.alternate_greetings = parameters.alternate_greetings.filter((greeting: string) => greeting && greeting.trim().length > 0);
      } else if (typeof parameters.alternate_greetings === 'string') {
        // Convert comma-separated string to array for backward compatibility
        characterUpdates.alternate_greetings = parameters.alternate_greetings.split('|').map((greeting: string) => greeting.trim()).filter((greeting: string) => greeting.length > 0);
      }
    }
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