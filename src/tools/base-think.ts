import { ChatPromptTemplate } from "@langchain/core/prompts";
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
 * Simple thinking capability - just evaluate and improve
 */
export abstract class BaseThinking {
  protected toolName: string;
  protected maxImprovementAttempts: number = 3; // 最多改进3次

  constructor(toolName: string) {
    this.toolName = toolName;
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
      console.warn(`[${this.toolName}] Evaluation failed:`, error);
      return this.createFallbackEvaluation();
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
      console.warn(`[${this.toolName}] Improvement generation failed:`, error);
      return this.createFallbackImprovement(evaluation);
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

  protected abstract executeThinkingChain(
    prompt: ChatPromptTemplate,
    context: BaseToolContext | PlanToolContext
  ): Promise<string>;

  /**
   * Parse evaluation response into structured result
   */
  protected parseEvaluationResponse(response: string): EvaluationResult {
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(response);
      return {
        is_satisfied: parsed.is_satisfied || false,
        quality_score: parsed.quality_score || 60,
        reasoning: parsed.reasoning || response,
        improvement_needed: parsed.improvement_needed || [],
        next_action: parsed.next_action || "continue"
      };
    } catch (error) {
      // Fallback to text parsing
      const isSatisfied = response.toLowerCase().includes("satisfied") || 
                         response.toLowerCase().includes("good enough") ||
                         response.toLowerCase().includes("完成");
      
      return {
        is_satisfied: isSatisfied,
        quality_score: isSatisfied ? 85 : 60,
        reasoning: response,
        improvement_needed: this.extractImprovements(response),
        next_action: isSatisfied ? "complete" : "improve"
      };
    }
  }

  /**
   * Parse improvement response into structured instruction
   */
  protected parseImprovementResponse(response: string): ImprovementInstruction {
    try {
      const parsed = JSON.parse(response);
      return {
        focus_areas: parsed.focus_areas || [],
        specific_requests: parsed.specific_requests || [],
        quality_target: parsed.quality_target || 80,
        max_attempts: this.maxImprovementAttempts
      };
    } catch (error) {
      return {
        focus_areas: ["整体质量"],
        specific_requests: [response],
        quality_target: 80,
        max_attempts: this.maxImprovementAttempts
      };
    }
  }

  /**
   * Create fallback evaluation when thinking fails
   */
  protected createFallbackEvaluation(): EvaluationResult {
    return {
      is_satisfied: false,
      quality_score: 50,
      reasoning: "思考系统暂时不可用，建议人工检查",
      improvement_needed: ["需要人工验证"],
      next_action: "continue"
    };
  }

  /**
   * Create fallback improvement instruction
   */
  protected createFallbackImprovement(evaluation: EvaluationResult): ImprovementInstruction {
    return {
      focus_areas: evaluation.improvement_needed,
      specific_requests: ["提高整体质量", "增加更多细节"],
      quality_target: 80,
      max_attempts: 2
    };
  }

  /**
   * Extract improvement suggestions from free text
   */
  protected extractImprovements(text: string): string[] {
    const improvements = [];
    const patterns = [
      /需要(\w+)/g,
      /应该(\w+)/g,
      /建议(\w+)/g,
      /improve\s+(\w+)/gi,
      /需要改进(\w+)/g
    ];
    
    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        improvements.push(match[1]);
      }
    }
    
    return improvements.slice(0, 5); // 最多5个改进建议
  }
} 