import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseToolContext } from "../../models/agent-model";
import { BaseThinking, EvaluationResult, ImprovementInstruction } from "../base-think";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/ollama";

/**
 * OUTPUT Tool Thinking Module
 * 输出工具的思考模块
 */
export class OutputThinking extends BaseThinking {
  constructor() {
    super("OUTPUT");
  }

  /**
   * Build evaluation prompt for OUTPUT results
   * 为OUTPUT结果构建评估提示
   */
  protected buildEvaluationPrompt(
    result: any,
    context: BaseToolContext,
    attempt: number
  ): ChatPromptTemplate {
    return ChatPromptTemplate.fromMessages([
      ["system", `You are evaluating the quality of generated content (characters/worldbooks) by the OUTPUT tool.
The tool should create detailed, engaging, and coherent characters and world elements.

Evaluation criteria:
- Is the content detailed and well-developed?
- Does it show creativity and originality?
- Is it consistent and coherent?
- Does it meet the user's requirements?
- Is it engaging and interesting?

Respond in JSON format:
{
  "is_satisfied": boolean,
  "quality_score": number (0-100),
  "reasoning": "detailed explanation",
  "improvement_needed": ["specific areas to improve"],
  "next_action": "continue" | "improve" | "complete"
}`],
      ["human", `Current attempt: ${attempt}

Generated content:
${JSON.stringify(result, null, 2)}

Context: The user is working on character/worldbook generation.
Current progress: ${context.task_progress.character_data ? 'Character exists' : 'No character'}, ${context.task_progress.worldbook_data?.length || 0} worldbook entries.

Evaluate the quality of this generated content:`]
    ]);
  }

  /**
   * Build improvement prompt for OUTPUT
   * 为OUTPUT构建改进提示
   */
  protected buildImprovementPrompt(
    originalResult: any,
    evaluation: EvaluationResult,
    context: BaseToolContext
  ): ChatPromptTemplate {
    return ChatPromptTemplate.fromMessages([
      ["system", `You are providing improvement instructions for the OUTPUT tool.
The tool needs to generate better character/worldbook content based on the evaluation feedback.

Focus on:
- Adding more detail and depth
- Improving creativity and originality
- Ensuring consistency and coherence
- Better meeting user requirements
- Making content more engaging

Respond in JSON format:
{
  "focus_areas": ["areas to focus on"],
  "specific_requests": ["specific improvement requests"],
  "quality_target": number (target score),
  "max_attempts": number
}`],
      ["human", `Original generated content:
${JSON.stringify(originalResult, null, 2)}

Evaluation feedback:
- Quality score: ${evaluation.quality_score}/100
- Reasoning: ${evaluation.reasoning}
- Issues found: ${evaluation.improvement_needed.join(', ')}

Provide specific improvement instructions for better content generation:`]
    ]);
  }

  /**
   * Execute thinking chain with LLM
   * 使用LLM执行思考链
   */
  protected async executeThinkingChain(
    prompt: ChatPromptTemplate,
    context: BaseToolContext
  ): Promise<string> {
    try {
      const llm = this.createLLM(context.llm_config);
      const chain = prompt.pipe(llm).pipe(new StringOutputParser());
      return await chain.invoke({});
    } catch (error) {
      console.warn(`[OUTPUT] Thinking chain failed:`, error);
      return "Unable to process thinking at this time.";
    }
  }

  /**
   * Public methods to expose protected functionality
   */
  async evaluateResult(result: any, context: BaseToolContext, attempt: number = 1) {
    return await this.evaluate(result, context, attempt);
  }

  async generateImprovementInstruction(result: any, evaluation: any, context: BaseToolContext) {
    return await this.generateImprovement(result, evaluation, context);
  }

  /**
   * Create LLM instance from config
   */
  private createLLM(config: BaseToolContext["llm_config"]) {
    if (config.llm_type === "openai") {
      return new ChatOpenAI({
        modelName: config.model_name,
        openAIApiKey: config.api_key,
        configuration: {
          baseURL: config.base_url,
        },
        temperature: config.temperature,
        maxTokens: config.max_tokens,
        streaming: false,
      });
    } else if (config.llm_type === "ollama") {
      return new ChatOllama({
        model: config.model_name,
        baseUrl: config.base_url || "http://localhost:11434",
        temperature: config.temperature,
        streaming: false,
      });
    }

    throw new Error(`Unsupported LLM type: ${config.llm_type}`);
  }
} 