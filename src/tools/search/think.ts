import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseToolContext } from "../../models/agent-model";
import { BaseThinking, EvaluationResult } from "../base-think";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/ollama";
import { searchPrompts } from "./prompts";
import { HumanMessage } from "@langchain/core/messages";

/**
 * SEARCH Tool Thinking Module
 * 搜索工具的思考模块
 */
export class SearchThinking extends BaseThinking {
  constructor() {
    super("SEARCH");
  }

  /**
   * Build evaluation prompt for SEARCH results
   * 为SEARCH结果构建评估提示
   */
  protected buildEvaluationPrompt(
    result: any,
    context: BaseToolContext,
    attempt: number
  ): ChatPromptTemplate {
    // Pre-build the human message content to avoid template conflicts
    const hasCharacter = context.task_progress.character_data ? 'Character exists' : 'No character';
    const worldbookCount = context.task_progress.worldbook_data?.length || 0;
    
    const humanContent = `Current attempt: ${attempt}

Search result:
${JSON.stringify(result, null, 2)}

Context: The user is working on character/worldbook generation.
Current progress: ${hasCharacter}, ${worldbookCount} worldbook entries.

Evaluate the quality and relevance of this search/inspiration result:`;
    
    return ChatPromptTemplate.fromMessages([
      ["system", searchPrompts.SEARCH_EVALUATION_SYSTEM],
      new HumanMessage(humanContent)
    ]);
  }

  /**
   * Build improvement prompt for SEARCH
   * 为SEARCH构建改进提示
   */
  protected buildImprovementPrompt(
    originalResult: any,
    evaluation: EvaluationResult,
    context: BaseToolContext
  ): ChatPromptTemplate {
    // Pre-build the human message content to avoid template conflicts
    const issuesFound = evaluation.improvement_needed.join(', ');
    
    const humanContent = `Original search result:
${JSON.stringify(originalResult, null, 2)}

Evaluation feedback:
- Quality score: ${evaluation.quality_score}/100
- Reasoning: ${evaluation.reasoning}
- Issues found: ${issuesFound}

Provide specific improvement instructions for better search/inspiration content:`;
    
    return ChatPromptTemplate.fromMessages([
      ["system", searchPrompts.SEARCH_IMPROVEMENT_SYSTEM],
      new HumanMessage(humanContent)
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
      console.warn(`[SEARCH] Thinking chain failed:`, error);
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