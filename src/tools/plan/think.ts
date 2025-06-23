import { ChatPromptTemplate } from "@langchain/core/prompts";
import { PlanToolContext } from "../../models/agent-model";
import { BaseThinking, EvaluationResult, ImprovementInstruction } from "../base-think";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/ollama";

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
    return ChatPromptTemplate.fromMessages([
      ["system", `You are evaluating the quality of planning decisions made by the PLAN tool.
The tool should create logical, efficient, and comprehensive plans to achieve user goals.

Evaluation criteria:
- Are the planned tasks logical and well-sequenced?
- Do the tasks efficiently work toward the goal?
- Is the plan comprehensive and complete?
- Are priorities set appropriately?
- Does it avoid unnecessary or redundant tasks?

Respond in JSON format:
{
  "is_satisfied": boolean,
  "quality_score": number (0-100),
  "reasoning": "detailed explanation",
  "improvement_needed": ["specific areas to improve"],
  "next_action": "continue" | "improve" | "complete"
}`],
      ["human", `Current attempt: ${attempt}

Planning result:
${JSON.stringify(result, null, 2)}

Context: The user is working on character/worldbook generation.
Current progress: ${context.task_progress.character_data ? 'Character exists' : 'No character'}, ${context.task_progress.worldbook_data?.length || 0} worldbook entries.
Current tasks: ${context.planning_context.current_tasks.length} pending, ${context.planning_context.completed_tasks.length} completed.

Evaluate the quality of this planning decision:`]
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
    return ChatPromptTemplate.fromMessages([
      ["system", `You are providing improvement instructions for the PLAN tool.
The tool needs to create better plans based on the evaluation feedback.

Focus on:
- Improving task logic and sequencing
- Increasing efficiency toward goals
- Making plans more comprehensive
- Better priority setting
- Removing unnecessary tasks

Respond in JSON format:
{
  "focus_areas": ["areas to focus on"],
  "specific_requests": ["specific improvement requests"],
  "quality_target": number (target score),
  "max_attempts": number
}`],
      ["human", `Original planning result:
${JSON.stringify(originalResult, null, 2)}

Evaluation feedback:
- Quality score: ${evaluation.quality_score}/100
- Reasoning: ${evaluation.reasoning}
- Issues found: ${evaluation.improvement_needed.join(', ')}

Current context:
- Pending tasks: ${context.planning_context.current_tasks.length}
- User request: ${context.planning_context.context.user_request}

Provide specific improvement instructions for better planning:`]
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