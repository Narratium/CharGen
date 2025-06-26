import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ToolType, ExecutionContext, GenerationOutput } from "../../models/agent-model";
import { BaseSimpleTool } from "../base-tool";

/**
 * Output Tool - Simple execution unit for final output generation
 * Creates character cards and worldbooks from knowledge base
 */
export class OutputTool extends BaseSimpleTool {
  readonly toolType = ToolType.OUTPUT;
  readonly name = "Output Generator";
  readonly description = "Generate final character card and worldbook output";
  readonly parameters = [
    {
      name: "type",
      type: "string" as const,
      description: "Type of output to generate",
      required: false,
      default: "complete",
      options: ["complete", "character_only", "worldbook_only", "preview"],
    },
    {
      name: "focus",
      type: "string" as const,
      description: "Focus area for generation",
      required: false,
      default: "both",
      options: ["character", "worldbook", "both"],
    },
  ];

  /**
   * Execute output generation based on knowledge base
   */
  protected async doWork(context: ExecutionContext, parameters: Record<string, any>): Promise<any> {
    const outputType = parameters.type || "complete";
    const focus = parameters.focus || "both"; // "character", "worldbook", or "both"
    
    console.log(`📄 Generating ${outputType} output with focus: ${focus}`);
    
    // Add output generation message
    await this.addMessage(
      context.session_id,
      "agent",
      `Generating final output: ${outputType} (${focus})`,
      "agent_output",
      { output_type: outputType, focus }
    );

    // Generate outputs based on focus
    let characterData = null;
    let worldbookData = null;

    if (focus === "character" || focus === "both") {
      characterData = await this.generateCharacterCard(context);
    }

    if (focus === "worldbook" || focus === "both") {
      worldbookData = await this.generateWorldbook(context);
    }

    // Calculate quality metrics
    const qualityMetrics = this.calculateQualityMetrics(context, characterData, worldbookData || []);

    // Create character progress update
    const GenerationOutput: Partial<GenerationOutput> = {
      character_data: characterData,
      worldbook_data: worldbookData || undefined,
      quality_metrics: qualityMetrics,
    };

    console.log(`✅ Generated output - Character: ${!!characterData}, Worldbook: ${!!worldbookData}`);

    return {
      output_type: outputType,
      focus,
      character_data: characterData,
      worldbook_data: worldbookData,
      quality_metrics: qualityMetrics,
      GenerationOutputUpdate: GenerationOutput // This will update character progress
    };
  }

  /**
   * Generate character card from knowledge base and user requirements
   */
  private async generateCharacterCard(context: ExecutionContext): Promise<any> {
    const prompt = ChatPromptTemplate.fromTemplate(`
You are an expert character creator. Generate a detailed character card based on the user requirements and gathered knowledge.

User Requirements:
{user_questions}

Task Context:
{task_context}

Knowledge Base:
{knowledge_base}

Recent Conversation:
{recent_conversation}

Create a comprehensive character card with the following structure:

{{
  "name": "character name",
  "description": "brief character description",
  "personality": "detailed personality description",
  "scenario": "initial scenario/setting description",
  "first_mes": "character's first message/greeting",
  "mes_example": "example dialogue between {{{{char}}}} and {{{{user}}}}",
  "creator_notes": "notes about the character creation process",
  "alternate_greetings": ["alternative greeting 1", "alternative greeting 2"],
  "tags": ["tag1", "tag2", "tag3"],
  "background": {{
    "age": "character age",
    "occupation": "character occupation",
    "appearance": "physical description",
    "history": "character background and history",
    "goals": "character goals and motivations",
    "relationships": "important relationships",
    "skills": "abilities and talents",
    "quirks": "unique traits and mannerisms"
  }}
}}

Guidelines:
- Make the character engaging and well-rounded
- Ensure consistency across all fields
- Use the knowledge base to inform character details
- Make the character interactive and dynamic
- Include specific details that make the character unique
- Ensure all dialogue examples use proper formatting
`);

    const response = await this.executeLLMChain(
      prompt,
      {
        user_questions: this.buildUserInteractionsSummary(context.research_state.user_interactions),
        task_context: this.buildTaskContextSummary(context),
        knowledge_base: this.buildKnowledgeBaseSummary(context.research_state.knowledge_base),
        recent_conversation: this.buildConversationSummary(context.message_history),
      },
      context,
      { parseJson: true, errorMessage: "Character card generation failed" }
    );

    return response;
  }

  /**
   * Generate worldbook from knowledge base and user requirements
   */
  private async generateWorldbook(context: ExecutionContext): Promise<any[]> {
    const prompt = ChatPromptTemplate.fromTemplate(`
You are an expert worldbuilder. Create worldbook entries based on the user requirements and gathered knowledge.

User Requirements:
{user_questions}

Task Context:
{task_context}

Knowledge Base:
{knowledge_base}

Recent Conversation:
{recent_conversation}

Create comprehensive worldbook entries that support the character and setting. Return as an array of entries:

[
  {{
    "id": "unique_id",
    "uid": "numeric_uid",
    "key": ["trigger", "keywords", "for", "this", "entry"],
    "keysecondary": ["secondary", "keywords"],
    "comment": "Description of what this entry covers",
    "content": "Detailed content that will be inserted into the conversation when triggered",
    "constant": false,
    "selective": true,
    "order": 100,
    "position": 0,
    "disable": false,
    "probability": 100,
    "useProbability": true
  }}
]

Guidelines for worldbook entries:
- Create 5-10 relevant entries covering key world elements
- Include entries for: locations, organizations, important NPCs, world rules, history, technology/magic
- Use clear, triggerable keywords
- Make content rich but concise
- Ensure entries complement the character
- Include both broad and specific concepts
- Make sure keywords won't trigger too frequently
- Content should enhance roleplay without overwhelming
`);

    const response = await this.executeLLMChain(
      prompt,
      {
        user_questions: this.buildUserInteractionsSummary(context.research_state.user_interactions),
        task_context: this.buildTaskContextSummary(context),
        knowledge_base: this.buildKnowledgeBaseSummary(context.research_state.knowledge_base),
        recent_conversation: this.buildConversationSummary(context.message_history),
      },
      context,
      { parseJson: true, errorMessage: "Worldbook generation failed" }
    );

    // Ensure response is an array
    return Array.isArray(response) ? response : (response.entries || []);
  }

  /**
   * Calculate quality metrics for the generated output
   */
  private calculateQualityMetrics(
    context: ExecutionContext, 
    characterData: any, 
    worldbookData: any[]
  ): any {
    const metrics = {
      completeness: 0,
      consistency: 0,
      creativity: 0,
      user_satisfaction: 0,
    };

    // Calculate completeness based on available data
    let completenessScore = 0;
    if (characterData) {
      const requiredFields = ['name', 'description', 'personality', 'scenario', 'first_mes'];
      const presentFields = requiredFields.filter(field => characterData[field] && characterData[field].length > 0);
      completenessScore += (presentFields.length / requiredFields.length) * 50;
    }
    
    if (worldbookData && worldbookData.length > 0) {
      completenessScore += Math.min(worldbookData.length * 5, 50); // Up to 50 points for worldbook
    }
    
    metrics.completeness = Math.min(completenessScore, 100);

    // Calculate consistency based on knowledge base usage
    const knowledgeBaseSize = context.research_state.knowledge_base.length;
    metrics.consistency = Math.min(knowledgeBaseSize * 10, 100);

    // Calculate creativity based on content richness
    const contentLength = (characterData ? JSON.stringify(characterData).length : 0) + 
                         (worldbookData ? JSON.stringify(worldbookData).length : 0);
    metrics.creativity = Math.min(contentLength / 100, 100);

    // User satisfaction based on completion status
    const avgCompletion = (
      context.research_state.progress.search_coverage +
      context.research_state.progress.information_quality +
      context.research_state.progress.answer_confidence
    ) / 3;
    metrics.user_satisfaction = avgCompletion;

    return metrics;
  }
} 