import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseToolContext } from "../../models/agent-model";
import { BaseThinking, EvaluationResult } from "../base-think";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { outputPrompts } from "./prompts";
import { HumanMessage } from "@langchain/core/messages";
import { SystemMessage } from "@langchain/core/messages";

/**
 * OUTPUT Tool Thinking Module - Enhanced with intelligent sub-tool routing
 * 输出工具的思考模块 - 增强智能子工具路由
 */
export class OutputThinking extends BaseThinking {
  constructor() {
    super("OUTPUT");
  }

  /**
   * NEW: Build routing prompt to intelligently select output sub-tool
   * 新增：构建路由提示以智能选择输出子工具
   */
  protected async buildRoutingPrompt(
    context: BaseToolContext,
    availableSubTools: string[]
  ): Promise<ChatPromptTemplate> {
    const hasCharacter = !!context.task_progress.character_data;
    const hasWorldbook = !!context.task_progress.worldbook_data && context.task_progress.worldbook_data.length > 0;
    const characterQuality = 0;
    const worldbookQuality = 0;
    const userRequest = context.conversation_history
      .filter(msg => msg.role === "user")
      .slice(-1)[0]?.content || "Generate content";
    const outputContext = context.conversation_history.length > 0 
      ? `Conversation with ${context.conversation_history.length} messages`
      : "No context available";

    // Build available sub-tools description
    const availableSubToolsDescription = availableSubTools.map(tool => 
      `- ${tool}: ${this.getSubToolDescription(tool)}`
    ).join('\n');

    // Use unified message format: front_message + system_prompt + human_prompt
    const systemPrompt = outputPrompts.SUBTOOL_ROUTING_SYSTEM.replace('{available_sub_tools}', availableSubToolsDescription);
    const humanPrompt = outputPrompts.SUBTOOL_ROUTING_HUMAN
      .replace('{has_character}', hasCharacter.toString())
      .replace('{has_worldbook}', hasWorldbook.toString())
      .replace('{character_quality}', characterQuality.toString())
      .replace('{worldbook_quality}', worldbookQuality.toString())
      .replace('{user_request}', userRequest)
      .replace('{output_context}', outputContext);

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
      "generateFinalOutput": "Generate complete final output with both character and worldbook",
      "generateCharacterOutput": "Generate character-only output and display",
      "generateWorldbookOutput": "Generate worldbook-only output and display", 
      "generateProgressReport": "Generate progress report when content is incomplete"
    };
    return descriptions[toolName] || "Unknown tool";
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
    // Pre-build the human message content to avoid template conflicts
    const hasCharacter = context.task_progress.character_data ? 'Character exists' : 'No character';
    const worldbookCount = context.task_progress.worldbook_data?.length || 0;
    
    const humanContent = `Current attempt: ${attempt}

Generated content:
${JSON.stringify(result, null, 2)}

Context: The user is working on character/worldbook generation.
Current progress: ${hasCharacter}, ${worldbookCount} worldbook entries.

Evaluate the quality of this generated content:`;
    
    return ChatPromptTemplate.fromMessages([
      new SystemMessage(outputPrompts.OUTPUT_EVALUATION_SYSTEM),
      new HumanMessage(humanContent)
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
    // Pre-build the human message content to avoid template conflicts
    const issuesFound = evaluation.improvement_needed.join(', ');
    
    const humanContent = `Original generated content:
${JSON.stringify(originalResult, null, 2)}

Evaluation feedback:
- Quality score: ${evaluation.quality_score}/100
- Reasoning: ${evaluation.reasoning}
- Issues found: ${issuesFound}

Provide specific improvement instructions for better content generation:`;
    
    return ChatPromptTemplate.fromMessages([
      new SystemMessage(outputPrompts.OUTPUT_IMPROVEMENT_SYSTEM),
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
   * NEW: Public method to route to sub-tool
   * 新增：路由到子工具的公共方法
   */
  async routeToSubTool(context: BaseToolContext, availableSubTools: string[]) {
    return await super.routeToSubTool(context, availableSubTools);
  }
} 