import { ChatPromptTemplate } from "@langchain/core/prompts";
import { PlanToolContext } from "../../models/agent-model";
import { BaseThinking, EvaluationResult, ImprovementInstruction } from "../base-think";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/ollama";
import { planPrompts } from "./prompts";
import { HumanMessage } from "@langchain/core/messages";

/**
 * PLAN Tool Thinking Module
 * 计划工具的思考模块
 */
export class PlanThinking extends BaseThinking {
  constructor() {
    super("PLAN");
  }

  /**
   * Build evaluation prompt for PLAN results
   * 为PLAN结果构建评估提示
   */
  protected buildEvaluationPrompt(
    result: any,
    context: PlanToolContext,
    attempt: number
  ): ChatPromptTemplate {
    // Pre-build the human message content to avoid template conflicts
    const hasCharacter = context.task_progress.character_data ? 'Character exists' : 'No character';
    const worldbookCount = context.task_progress.worldbook_data?.length || 0;
    const currentTasksCount = context.planning_context.current_tasks.length;
    const completedTasksCount = context.planning_context.completed_tasks.length;
    
    const humanContent = `Current attempt: ${attempt}

Planning result:
${JSON.stringify(result, null, 2)}

Context: The user is working on character/worldbook generation.
Current progress: ${hasCharacter}, ${worldbookCount} worldbook entries.
Current tasks: ${currentTasksCount} pending, ${completedTasksCount} completed.

Evaluate the quality of this planning decision:`;
    
    return ChatPromptTemplate.fromMessages([
      ["system", planPrompts.PLAN_EVALUATION_SYSTEM],
      new HumanMessage(humanContent)
    ]);
  }

  /**
   * Build improvement prompt for PLAN
   * 为PLAN构建改进提示
   */
  protected buildImprovementPrompt(
    originalResult: any,
    evaluation: EvaluationResult,
    context: PlanToolContext
  ): ChatPromptTemplate {
    // Pre-build the human message content to avoid template conflicts
    const pendingTasksCount = context.planning_context.current_tasks.length;
    const userRequest = context.planning_context.context.user_request;
    const issuesFound = evaluation.improvement_needed.join(', ');
    
    const humanContent = `Original planning result:
${JSON.stringify(originalResult, null, 2)}

Evaluation feedback:
- Quality score: ${evaluation.quality_score}/100
- Reasoning: ${evaluation.reasoning}
- Issues found: ${issuesFound}

Current context:
- Pending tasks: ${pendingTasksCount}
- User request: ${userRequest}

Provide specific improvement instructions for better planning:`;
    
    return ChatPromptTemplate.fromMessages([
      ["system", planPrompts.PLAN_IMPROVEMENT_SYSTEM],
      new HumanMessage(humanContent)
    ]);
  }

  /**
   * Execute thinking chain with LLM
   * 使用LLM执行思考链
   */
  protected async executeThinkingChain(
    prompt: ChatPromptTemplate,
    context: PlanToolContext
  ): Promise<string> {
    try {
      const llm = this.createLLM(context.llm_config);
      const chain = prompt.pipe(llm).pipe(new StringOutputParser());
      return await chain.invoke({});
    } catch (error) {
      console.warn(`[PLAN] Thinking chain failed:`, error);
      return "Unable to process thinking at this time.";
    }
  }

  /**
   * Public methods to expose protected functionality
   */
  async evaluateResult(result: any, context: PlanToolContext, attempt: number = 1) {
    return await this.evaluate(result, context, attempt);
  }

  async generateImprovementInstruction(result: any, evaluation: any, context: PlanToolContext) {
    return await this.generateImprovement(result, evaluation, context);
  }

  /**
   * Create LLM instance from config
   */
  private createLLM(config: PlanToolContext["llm_config"]) {
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