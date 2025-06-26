import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ToolType, ExecutionContext } from "../../models/agent-model";
import { BaseSimpleTool } from "../base-tool";

/**
 * Ask User Tool - Simple execution unit for user interaction
 * Updates user questions array after asking
 */
export class AskUserTool extends BaseSimpleTool {
  readonly toolType = ToolType.ASK_USER;
  readonly name = "Ask User Tool";
  readonly description = "Ask user for clarification or additional requirements";
  readonly parameters = [
    {
      name: "type",
      type: "string" as const,
      description: "Type of question to ask the user",
      required: false,
      default: "clarification",
      options: ["clarification", "requirements", "preferences", "details", "creative_input"],
    },
    {
      name: "topic",
      type: "string" as const,
      description: "Specific topic or area to ask about",
      required: false,
      default: "general requirements",
    },
  ];

  /**
   * Execute user question generation and update questions array
   */
  protected async doWork(context: ExecutionContext, parameters: Record<string, any>): Promise<any> {
    const requestType = parameters.type || "clarification";
    const specificTopic = parameters.topic || "general requirements";
    
    console.log(`❓ Generating user question about: ${specificTopic}`);
    
    // Generate intelligent question based on current context
    const questionData = await this.generateQuestion(context, requestType, specificTopic);
    
    // Create user question entry for tracking
    const UserInteractionEntry = this.createUserInteraction(
      questionData.question,
      false, // Not initial question
      context.research_state.user_interactions.find(q => q.is_initial)?.id
    );
    
    // Add question message to conversation
    await this.addMessage(
      context.session_id,
      "agent",
      questionData.question,
      "agent_action",
      { 
        question_type: requestType,
        topic: specificTopic,
        reasoning: questionData.reasoning 
      }
    );
    
    console.log(`✅ Generated question: ${questionData.question.substring(0, 50)}...`);
    
    return {
      message: questionData.question,
      type: requestType,
      topic: specificTopic,
      reasoning: questionData.reasoning,
      suggested_answers: questionData.suggested_answers || [],
      UserInteractionsUpdates: [UserInteractionEntry] // This will update the questions array
    };
  }

  /**
   * Generate intelligent question based on context
   */
  private async generateQuestion(
    context: ExecutionContext, 
    requestType: string, 
    specificTopic: string
  ): Promise<any> {
    const prompt = ChatPromptTemplate.fromTemplate(`
You are an AI assistant helping to create character cards and worldbooks. You need to ask the user a specific question to gather more information.

Current Task Context:
{task_context}

Current Knowledge Base:
{knowledge_base}

Previous User Questions and Answers:
{user_questions}

Recent Conversation:
{recent_conversation}

Request Type: {request_type}
Specific Topic: {specific_topic}

Based on the current context and what you already know, generate a thoughtful question that will help gather the missing information needed to create better character cards and worldbooks.

Guidelines:
- Be specific and focused on the topic
- Avoid asking questions that have already been answered
- Make the question actionable and clear
- Consider what information would be most valuable right now
- If asking for clarification, reference specific unclear points

Return your response in JSON format:
{{
  "question": "the specific question to ask the user",
  "reasoning": "why this question is important right now",
  "question_category": "requirements|preferences|clarification|details|creative_input",
  "expected_answer_type": "text|choice|description|list",
  "suggested_answers": ["optional", "suggested", "answers"],
  "priority": 1-10
}}
`);

    const response = await this.executeLLMChain(
      prompt,
      {
        task_context: this.buildTaskContextSummary(context),
        knowledge_base: this.buildKnowledgeBaseSummary(context.research_state.knowledge_base),
        user_questions: this.buildUserInteractionsSummary(context.research_state.user_interactions),
        recent_conversation: this.buildConversationSummary(context.message_history),
        request_type: requestType,
        specific_topic: specificTopic,
      },
      context,
      { parseJson: true, errorMessage: "Question generation failed" }
    );

    return response;
  }

} 