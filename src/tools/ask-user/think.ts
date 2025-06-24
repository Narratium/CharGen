import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseToolContext } from "../../models/agent-model";
import { BaseThinking, EvaluationResult } from "../base-think";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { askUserPrompts } from "./prompts";
import { HumanMessage } from "@langchain/core/messages";
import { SystemMessage } from "@langchain/core/messages";

/**
 * ASK_USER Tool Thinking Module - Enhanced with routing capability
 * 询问用户工具的思考模块 - 增强路由功能
 */
export class AskUserThinking extends BaseThinking {
  constructor() {
    super("ASK_USER");
  }

  /**
   * Build routing prompt for ask-user sub-tools (prepared for future expansion)
   * 为询问用户子工具构建路由提示（为未来扩展做准备）
   */
  protected async buildRoutingPrompt(
    context: BaseToolContext,
    availableSubTools: string[]
  ): Promise<ChatPromptTemplate> {
    const userRequest = context.conversation_history
      .filter(msg => msg.role === "user")
      .slice(-1)[0]?.content || "Generate content";
    const infoNeeded = "Additional information for character/worldbook generation";
    const progressContext = `Character exists: ${!!context.task_progress.character_data}, 
      Worldbook entries: ${context.task_progress.worldbook_data?.length || 0}`;

    // Build available sub-tools description
    const availableSubToolsDescription = availableSubTools.map(tool => 
      `- ${tool}: ${this.getSubToolDescription(tool)}`
    ).join('\n');

    // Use unified message format: front_message + system_prompt + human_prompt
    const systemPrompt = askUserPrompts.SUBTOOL_ROUTING_SYSTEM.replace('{available_sub_tools}', availableSubToolsDescription);
    const humanPrompt = askUserPrompts.SUBTOOL_ROUTING_HUMAN
      .replace('{user_request}', userRequest)
      .replace('{info_needed}', infoNeeded)
      .replace('{progress_context}', progressContext);

    return ChatPromptTemplate.fromMessages([
      new SystemMessage(systemPrompt),
      new HumanMessage(humanPrompt)
    ]);
  }

  /**
   * Get description for each sub-tool
   * 获取每个子工具的描述
   */
  private getSubToolDescription(toolName: string): string {
    const descriptions: Record<string, string> = {
      "askContextualQuestions": "Generate contextual questions based on current progress"
    };
    return descriptions[toolName] || "Unknown user interaction tool";
  }

  /**
   * Build evaluation prompt for ASK_USER results
   * 为ASK_USER结果构建评估提示
   */
  protected buildEvaluationPrompt(
    result: any,
    context: BaseToolContext,
    attempt: number
  ): ChatPromptTemplate {
    // Pre-build the human message content to avoid template conflicts
    const hasCharacter = context.task_progress.character_data ? 'Character exists' : 'No character';
    const worldbookCount = context.task_progress.worldbook_data?.length || 0;
    const questionLength = result.message?.length || 0;
    
    const humanContent = `Current attempt: ${attempt}

Generated questions:
${JSON.stringify(result, null, 2)}

Context: The user is working on character/worldbook generation.
Current progress: ${hasCharacter}, ${worldbookCount} worldbook entries.
Question length: ${questionLength} characters.

Evaluate the quality and relevance of these questions:`;
    
    return ChatPromptTemplate.fromMessages([
      new SystemMessage(askUserPrompts.ASK_USER_EVALUATION_SYSTEM),
      new HumanMessage(humanContent)
    ]);
  }

  /**
   * Build improvement prompt for ASK_USER
   * 为ASK_USER构建改进提示
   */
  protected buildImprovementPrompt(
    originalResult: any,
    evaluation: EvaluationResult,
    context: BaseToolContext
  ): ChatPromptTemplate {
    // Pre-build the human message content to avoid template conflicts
    const issuesFound = evaluation.improvement_needed.join(', ');
    
    const humanContent = `Original questions:
${JSON.stringify(originalResult, null, 2)}

Evaluation feedback:
- Quality score: ${evaluation.quality_score}/100
- Reasoning: ${evaluation.reasoning}
- Issues found: ${issuesFound}

Provide specific improvement instructions for better questions:`;
    
    return ChatPromptTemplate.fromMessages([
      new SystemMessage(askUserPrompts.ASK_USER_IMPROVEMENT_SYSTEM),
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
      console.warn(`[ASK_USER] Thinking chain failed:`, error);
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
   * Public method to route to sub-tool
   */
  async routeToSubTool(context: BaseToolContext, availableSubTools: string[]) {
    return await super.routeToSubTool(context, availableSubTools);
  }
} 