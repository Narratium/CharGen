import { ChatPromptTemplate } from "@langchain/core/prompts";
import { BaseToolContext } from "../../models/agent-model";
import { BaseThinking, EvaluationResult } from "../base-think";
import { searchPrompts } from "./prompts";
import { HumanMessage } from "@langchain/core/messages";
import { SystemMessage } from "@langchain/core/messages";

/**
 * SEARCH Tool Thinking Module - Enhanced with routing capability
 * 搜索工具的思考模块 - 增强路由功能
 */
export class SearchThinking extends BaseThinking {
  constructor() {
    super("SEARCH");
  }

  /**
   * Build routing prompt for search sub-tools (currently single tool, but prepared for future)
   * 为搜索子工具构建路由提示（目前是单一工具，但为未来做准备）
   */
  protected async buildRoutingPrompt(
    context: BaseToolContext,
    availableSubTools: string[]
  ): Promise<ChatPromptTemplate> {
    const userRequest = context.conversation_history
      .filter(msg => msg.role === "user")
      .slice(-1)[0]?.content || "General research";
    const taskType = "Character/Worldbook generation";
    const researchContext = `Character exists: ${!!context.task_progress.character_data}, 
      Worldbook entries: ${context.task_progress.worldbook_data?.length || 0}`;

    // Build available sub-tools description
    const availableSubToolsDescription = availableSubTools.map(tool => 
      `- ${tool}: ${this.getSubToolDescription(tool)}`
    ).join('\n');

    // Use unified message format: front_message + system_prompt + human_prompt
    const systemPrompt = searchPrompts.SUBTOOL_ROUTING_SYSTEM.replace('{available_sub_tools}', availableSubToolsDescription);
    const humanPrompt = searchPrompts.SUBTOOL_ROUTING_HUMAN
      .replace('{user_request}', userRequest)
      .replace('{task_type}', taskType)
      .replace('{research_context}', researchContext);

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
      "searchAndInspire": "Search for inspiration and creative references"
    };
    return descriptions[toolName] || "Unknown search tool";
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
    const queriesUsed = result.queries?.length || 0;
    const resultsFound = result.results?.length || 0;
    
    const humanContent = `Current attempt: ${attempt}

Search results:
${JSON.stringify(result, null, 2)}

Context: The user is working on character/worldbook generation.
Current progress: ${hasCharacter}, ${worldbookCount} worldbook entries.
Search stats: ${queriesUsed} queries, ${resultsFound} results found.

Evaluate the quality and relevance of these search results:`;
    
    return ChatPromptTemplate.fromMessages([
      new SystemMessage(searchPrompts.SEARCH_EVALUATION_SYSTEM),
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
    
    const humanContent = `Original search results:
${JSON.stringify(originalResult, null, 2)}

Evaluation feedback:
- Quality score: ${evaluation.quality_score}/100
- Reasoning: ${evaluation.reasoning}
- Issues found: ${issuesFound}

Provide specific improvement instructions for better search results:`;
    
    return ChatPromptTemplate.fromMessages([
      new SystemMessage(searchPrompts.SEARCH_IMPROVEMENT_SYSTEM),
      new HumanMessage(humanContent)
    ]);
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