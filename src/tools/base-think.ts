import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { HumanMessage } from "@langchain/core/messages";
import { SystemMessage } from "@langchain/core/messages";
import { BaseToolContext, PlanToolContext } from "../models/agent-model";

// ============================================================================
// SIMPLE THINKING FRAMEWORK - Self-evaluation and Continuous Improvement
// ============================================================================

/**
 * Simple evaluation result - is the work good enough?
 */
export interface EvaluationResult {
  is_satisfied: boolean;           // 是否满意当前结果
  quality_score: number;           // 质量评分 0-100
  reasoning: string;               // 评估理由
  improvement_needed: string[];    // 需要改进的方面
  next_action: "continue" | "improve" | "complete"; // 下一步行动
}

/**
 * Improvement instruction for the tool
 */
export interface ImprovementInstruction {
  focus_areas: string[];           // 重点改进区域
  specific_requests: string[];     // 具体改进要求
  quality_target: number;          // 目标质量分数
  max_attempts: number;            // 最大尝试次数
}

/**
 * NEW: Sub-tool routing decision interface
 * 新增：子工具路由决策接口
 */
export interface SubToolRoutingDecision {
  selected_sub_tool: string;       // 选择的子工具名称
  reasoning: string;               // 选择理由
  confidence: number;              // 决策confidence (0-100)
}

/**
 * Simple thinking capability - just evaluate and improve
 * Enhanced with intelligent sub-tool routing
 */
export abstract class BaseThinking {
  protected toolName: string;
  protected maxImprovementAttempts: number = 3; // 最多改进3次

  constructor(toolName: string) {
    this.toolName = toolName;
  }

  /**
   * NEW: Intelligent sub-tool routing - decide which sub-tool to use
   * 新增：智能子工具路由 - 决定使用哪个子工具
   */
  async routeToSubTool(
    context: BaseToolContext | PlanToolContext,
    availableSubTools: string[]
  ): Promise<SubToolRoutingDecision> {
    try {
      const prompt = await this.buildRoutingPrompt(context, availableSubTools);
      const response = await this.executeThinkingChain(prompt, context);
      console.log("response",response)
      
      return this.parseRoutingResponse(response, availableSubTools);
    } catch (error) {
      // Log failure instead of creating fallback
      console.error(`[${this.toolName}] Sub-tool routing failed:`, error);
      throw new Error(`Sub-tool routing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Core method: Evaluate if the result is good enough
   * 核心方法：评估结果是否足够好
   */
  async evaluate(
    result: any,
    context: BaseToolContext | PlanToolContext,
    attempt: number = 1
  ): Promise<EvaluationResult> {
    try {
      const prompt = this.buildEvaluationPrompt(result, context, attempt);
      const response = await this.executeThinkingChain(prompt, context);
      return this.parseEvaluationResponse(response);
    } catch (error) {
      // Log failure instead of creating fallback
      console.error(`[${this.toolName}] Evaluation failed:`, error);
      throw new Error(`Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate improvement instructions when result is not satisfactory
   * 当结果不满意时生成改进指令
   */
  async generateImprovement(
    originalResult: any,
    evaluation: EvaluationResult,
    context: BaseToolContext | PlanToolContext
  ): Promise<ImprovementInstruction> {
    try {
      const prompt = this.buildImprovementPrompt(originalResult, evaluation, context);
      const response = await this.executeThinkingChain(prompt, context);
      
      return this.parseImprovementResponse(response);
    } catch (error) {
      // Log failure instead of creating fallback
      console.error(`[${this.toolName}] Improvement generation failed:`, error);
      throw new Error(`Improvement generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Abstract methods - each tool implements its own evaluation criteria
   * 抽象方法 - 每个工具实现自己的评估标准
   */
  protected abstract buildEvaluationPrompt(
    result: any,
    context: BaseToolContext | PlanToolContext,
    attempt: number
  ): ChatPromptTemplate;

  protected abstract buildImprovementPrompt(
    originalResult: any,
    evaluation: EvaluationResult,
    context: BaseToolContext | PlanToolContext
  ): ChatPromptTemplate;

  /**
   * NEW: Abstract method for sub-tool routing prompt
   * 新增：子工具路由提示的抽象方法
   */
  protected abstract buildRoutingPrompt(
    context: BaseToolContext | PlanToolContext,
    availableSubTools: string[]
  ): Promise<ChatPromptTemplate>;

  /**
   * Parse sub-tool routing response
   * 解析子工具路由响应
   */
  protected parseRoutingResponse(
    response: string,
    availableSubTools: string[]
  ): SubToolRoutingDecision {
    try {
      // Extract JSON from response (handle code blocks)
      const cleanedResponse = this.extractJsonFromResponse(response);
      const parsed = JSON.parse(cleanedResponse);
      const selectedTool = parsed.selected_sub_tool || availableSubTools[0];
      
      // Validate that selected tool is available
      if (!availableSubTools.includes(selectedTool)) {
        console.warn(`Selected sub-tool "${selectedTool}" not available, using first available`);
        return {
          selected_sub_tool: availableSubTools[0],
          reasoning: `Fallback: Original selection "${selectedTool}" not available`,
          confidence: 50
        };
      }

      return {
        selected_sub_tool: selectedTool,
        reasoning: parsed.reasoning || `Selected ${selectedTool}`,
        confidence: Math.min(Math.max(parsed.confidence || 80, 0), 100)
      };
    } catch (error) {
      // Log failure and throw error instead of fallback
      console.error(`[${this.toolName}] Failed to parse routing response:`, error);
      console.error(`[${this.toolName}] Original response:`, response);
      throw new Error(`Failed to parse routing response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse evaluation response into structured result
   */
  protected parseEvaluationResponse(response: string): EvaluationResult {
    try {
      // Extract JSON from response (handle code blocks)
      const cleanedResponse = this.extractJsonFromResponse(response);
      const parsed = JSON.parse(cleanedResponse);
      return {
        is_satisfied: parsed.is_satisfied || false,
        quality_score: parsed.quality_score || 60,
        reasoning: parsed.reasoning || response,
        improvement_needed: parsed.improvement_needed || [],
        next_action: parsed.next_action || "continue"
      };
    } catch (error) {
      // Log failure and throw error instead of fallback
      console.error(`[${this.toolName}] Failed to parse evaluation response:`, error);
      console.error(`[${this.toolName}] Original response:`, response);
      throw new Error(`Failed to parse evaluation response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse improvement response into structured instruction
   */
  protected parseImprovementResponse(response: string): ImprovementInstruction {
    try {
      // Extract JSON from response (handle code blocks)
      const cleanedResponse = this.extractJsonFromResponse(response);
      const parsed = JSON.parse(cleanedResponse);
      return {
        focus_areas: parsed.focus_areas || [],
        specific_requests: parsed.specific_requests || [],
        quality_target: parsed.quality_target || 80,
        max_attempts: this.maxImprovementAttempts
      };
    } catch (error) {
      // Log failure and throw error instead of fallback
      console.error(`[${this.toolName}] Failed to parse improvement response:`, error);
      console.error(`[${this.toolName}] Original response:`, response);
      throw new Error(`Failed to parse improvement response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Shared LLM creation method - eliminates duplication across all thinking modules
   * 共享的LLM创建方法 - 消除所有思考模块中的重复代码
   */
  protected createLLM(config: BaseToolContext["llm_config"] | PlanToolContext["llm_config"]) {
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

  /**
   * Shared thinking chain execution - eliminates duplication across all thinking modules
   * 共享的思考链执行 - 消除所有思考模块中的重复代码
   */
  protected async executeThinkingChain(
    prompt: ChatPromptTemplate,
    context: BaseToolContext | PlanToolContext
  ): Promise<string> {
    try {
      const llm = this.createLLM(context.llm_config);
      const chain = prompt.pipe(llm).pipe(new StringOutputParser());
      return await chain.invoke({});
    } catch (error) {
      console.warn(`[${this.toolName}] Thinking chain failed:`, error);
      return "Unable to process thinking at this time.";
    }
  }

  /**
   * Extract JSON from response - handles code blocks and formatting
   * 从响应中提取JSON - 处理代码块和格式化
   */
  protected extractJsonFromResponse(response: string): string {
    let cleaned = response.trim();
    
    // Remove code block markers
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    
    // Find JSON boundaries
    let jsonStart = -1;
    let jsonEnd = -1;
    
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '{' || cleaned[i] === '[') {
        jsonStart = i;
        break;
      }
    }
    
    for (let i = cleaned.length - 1; i >= 0; i--) {
      if (cleaned[i] === '}' || cleaned[i] === ']') {
        jsonEnd = i + 1;
        break;
      }
    }
    
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonStart < jsonEnd) {
      return cleaned.substring(jsonStart, jsonEnd);
    }
    
    return cleaned.trim();
  }
} 