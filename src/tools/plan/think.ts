import { ChatPromptTemplate } from "@langchain/core/prompts";
import { PlanToolContext } from "../../models/agent-model";
import { BaseThinking, EvaluationResult } from "../base-think";
import { StringOutputParser } from "@langchain/core/output_parsers";  
import { planPrompts } from "./prompts";
import { HumanMessage } from "@langchain/core/messages";
import { SystemMessage } from "@langchain/core/messages";

/**
 * PLAN Tool Thinking Module - Enhanced with intelligent sub-tool routing
 * 计划工具的思考模块 - 增强智能子工具路由
 */
export class PlanThinking extends BaseThinking {
  constructor() {
    super("PLAN");
  }

  /**
   * NEW: Build routing prompt to intelligently select plan sub-tool
   * 新增：构建路由提示以智能选择计划子工具
   */
  protected async buildRoutingPrompt(
    context: PlanToolContext,
    availableSubTools: string[]
  ): Promise<ChatPromptTemplate> {
    const hasCharacter = !!context.task_progress.character_data;
    const hasWorldbook = !!context.task_progress.worldbook_data && context.task_progress.worldbook_data.length > 0;
    const currentTasksCount = context.planning_context.current_tasks.length;
    const completedTasksCount = context.planning_context.completed_tasks.length;
    const hasFailures = Object.values(context.planning_context.context.failure_history.failed_tool_attempts).some(count => count > 0);
    const userRequest = context.planning_context.context.user_request;

    // Build available sub-tools description
    const availableSubToolsDescription = availableSubTools.map(tool => 
      `- ${tool}: ${this.getSubToolDescription(tool)}`
    ).join('\n');

    // Use unified message format: front_message + system_prompt + human_prompt
    const systemPrompt = planPrompts.SUBTOOL_ROUTING_SYSTEM.replace('{available_sub_tools}', availableSubToolsDescription);
    const humanPrompt = planPrompts.SUBTOOL_ROUTING_HUMAN
      .replace('{current_tasks_count}', currentTasksCount.toString())
      .replace('{completed_tasks_count}', completedTasksCount.toString())
      .replace('{has_character}', hasCharacter.toString())
      .replace('{has_worldbook}', hasWorldbook.toString())
      .replace('{has_failures}', hasFailures.toString())
      .replace('{user_request}', userRequest);

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
      "createInitialPlan": "Create initial execution plan with goals and tasks",
      "analyzeFailures": "Analyze recent failures and suggest alternatives", 
      "evaluateProgress": "Evaluate overall progress and completion status",
      "updatePlan": "Update existing plan with new tasks and adjustments"
    };
    return descriptions[toolName] || "Unknown tool";
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
      new SystemMessage(planPrompts.PLAN_EVALUATION_SYSTEM),
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
      new SystemMessage(planPrompts.PLAN_IMPROVEMENT_SYSTEM),
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
   * NEW: Public method to route to sub-tool
   * 新增：路由到子工具的公共方法
   */
  async routeToSubTool(context: PlanToolContext, availableSubTools: string[]) {
    return await super.routeToSubTool(context, availableSubTools);
  }
} 