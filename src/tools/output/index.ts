import { BaseRegularTool } from "../base-tool";
import { ToolType, BaseToolContext, ToolExecutionResult } from "../../models/agent-model";
import { AgentConversationOperations } from "@/data/agent/agent-conversation-operations";
import { outputPrompts } from "./prompts";
import { OutputThinking } from "./think";
import { ImprovementInstruction } from "../base-think";

/**
 * OUTPUT Tool - Enhanced with thinking capabilities
 * 输出工具 - 增强思考能力
 */
export class OutputTool extends BaseRegularTool {
  readonly toolType = ToolType.OUTPUT;
  readonly name = "Output Generator";
  readonly description = "Generate final output and present results to user";

  private thinking: OutputThinking;

  constructor() {
    super();
    this.thinking = new OutputThinking();
  }

  /**
   * Core work logic - generate output based on current progress
   * 核心工作逻辑 - 根据当前进度生成输出
   */
  async doWork(context: BaseToolContext): Promise<any> {
    // Determine what type of output to generate based on current progress
    const hasCharacter = !!context.task_progress.character_data;
    const hasWorldbook = !!context.task_progress.worldbook_data && context.task_progress.worldbook_data.length > 0;

    if (hasCharacter && hasWorldbook) {
      return await this.generateFinalOutput(context);
    } else if (hasCharacter) {
      return await this.generateCharacterOutput(context);
    } else if (hasWorldbook) {
      return await this.generateWorldbookOutput(context);
    } else {
      return await this.generateProgressReport(context);
    }
  }

  /**
   * Improvement logic - enhance output based on feedback
   * 改进逻辑 - 根据反馈增强输出
   */
  async improve(
    currentResult: any,
    instruction: ImprovementInstruction,
    context: BaseToolContext
  ): Promise<any> {
    try {
      console.log(`🔄 [OUTPUT] Improving output based on: ${instruction.focus_areas.join(', ')}`);
      
      // Generate improved output based on instruction
      const improvedOutput = await this.generateImprovedOutput(
        currentResult,
        instruction,
        context
      );
      
      return {
        ...improvedOutput,
        improvementApplied: instruction.focus_areas,
        previousResult: currentResult
      };
      
    } catch (error) {
      // Don't fake success with fallback - let base class handle failure
      throw new Error(`Output improvement failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Implement thinking capabilities using public methods
   */
  async evaluate(result: any, context: BaseToolContext, attempt: number = 1) {
    return await this.thinking.evaluateResult(result, context, attempt);
  }

  async generateImprovement(result: any, evaluation: any, context: BaseToolContext) {
    return await this.thinking.generateImprovementInstruction(result, evaluation, context);
  }

  protected buildEvaluationPrompt = () => { throw new Error("Use evaluate() instead"); };
  protected buildImprovementPrompt = () => { throw new Error("Use generateImprovement() instead"); };
  protected executeThinkingChain = () => { throw new Error("Use thinking methods directly"); };

  /**
   * Generate improved output based on feedback
   */
  private async generateImprovedOutput(
    currentResult: any,
    instruction: ImprovementInstruction,
    context: BaseToolContext
  ): Promise<any> {
    const improvementPrompt = `Improve the generated content based on these instructions:

FOCUS AREAS: ${instruction.focus_areas.join(', ')}
SPECIFIC REQUESTS: ${instruction.specific_requests.join(', ')}
TARGET QUALITY: ${instruction.quality_target}/100

CURRENT OUTPUT:
${JSON.stringify(currentResult, null, 2)}

Generate improved content that addresses the feedback above.`;

    const prompt = this.buildContextualPrompt(
      outputPrompts.FINAL_OUTPUT_SYSTEM + "\n\nYou are improving existing output based on feedback.",
      improvementPrompt,
      context
    );

    const improvedContent = await this.executeLLMChain(prompt, {
      improvement_context: "Improving output based on feedback"
    }, context, {
      errorMessage: "Failed to generate improved output"
    });

    return {
      ...currentResult,
      output: improvedContent,
      improved: true
    };
  }

  /**
   * Generate final output with both character and worldbook
   */
  private async generateFinalOutput(context: BaseToolContext): Promise<any> {
    const { task_progress } = context;

    // Check if we have both character and worldbook data
    if (!task_progress.character_data) {
      return {
        success: false,
        error: "Cannot generate final output: Character data is missing",
        should_continue: true,
        reasoning: "Need character data before generating final output"
      };
    }

    if (!task_progress.worldbook_data || task_progress.worldbook_data.length === 0) {
      return {
        success: false,
        error: "Cannot generate final output: Worldbook data is missing",
        should_continue: true,
        reasoning: "Need worldbook data before generating final output"
      };
    }

    // Build the final output prompt using the context manager
    const prompt = this.buildContextualPrompt(
      outputPrompts.FINAL_OUTPUT_SYSTEM,
      outputPrompts.FINAL_OUTPUT_HUMAN,
      context
    );

    try {
      // Generate final output using LLM
      const finalOutput = await this.executeLLMChain(
        prompt,
        {
          character_name: task_progress.character_data.name,
          character_description: task_progress.character_data.description,
          worldbook_entries: task_progress.worldbook_data.length,
          quality_score: task_progress.quality_metrics?.completeness || 0
        },
        context
      );

      // Add the final output message to conversation
      await this.addMessage(
        context.conversation_id,
        "agent",
        finalOutput,
        "agent_output"
      );
    
      // Update quality metrics
      await AgentConversationOperations.updateTaskProgress(context.conversation_id, {
        quality_metrics: {
          completeness: 100,
          consistency: task_progress.quality_metrics?.consistency || 85,
          creativity: task_progress.quality_metrics?.creativity || 80,
          user_satisfaction: task_progress.quality_metrics?.user_satisfaction || 85
        }
      });

      return this.createSuccessResult(
        {
          output: finalOutput,
          character_data: task_progress.character_data,
          worldbook_data: task_progress.worldbook_data,
          message: "✅ Character and worldbook generation completed successfully!"
        },
        {
          shouldContinue: false, // This is the final step
          reasoning: "Successfully generated and presented final output"
        }
      );

    } catch (error) {
      // Don't fake success with fallback - let base class handle failure
      throw new Error(`Final output generation failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Generate progress report
   */
  private async generateProgressReport(context: BaseToolContext): Promise<ToolExecutionResult> {
    const { task_progress } = context;

    // Build progress summary
    const hasCharacter = !!task_progress.character_data;
    const hasWorldbook = !!task_progress.worldbook_data && task_progress.worldbook_data.length > 0;
    
    let progressReport = "📊 **Generation Progress Report**\n\n";
    
    if (hasCharacter) {
      progressReport += `✅ **Character Card**: COMPLETE\n`;
      progressReport += `   - Name: ${task_progress.character_data!.name}\n`;
      progressReport += `   - Description: ${task_progress.character_data!.description.substring(0, 100)}...\n\n`;
    } else {
      progressReport += `❌ **Character Card**: NOT GENERATED\n\n`;
    }
    
    if (hasWorldbook) {
      progressReport += `✅ **Worldbook**: COMPLETE (${task_progress.worldbook_data!.length} entries)\n`;
      progressReport += "   - Recent entries:\n";
      for (const entry of task_progress.worldbook_data!.slice(0, 3)) {
        progressReport += `     * ${entry.comment}\n`;
      }
      if (task_progress.worldbook_data!.length > 3) {
        progressReport += `     * ... and ${task_progress.worldbook_data!.length - 3} more\n`;
      }
    } else {
      progressReport += `❌ **Worldbook**: NOT GENERATED\n`;
    }

    progressReport += `\n🔧 **Tools Used**: ${task_progress.generation_metadata.tools_used.join(", ")}\n`;
    progressReport += `📈 **Iterations**: ${task_progress.generation_metadata.total_iterations}\n`;

    // Add progress report to conversation
    await this.addMessage(
      context.conversation_id, 
      "agent", 
      progressReport,
      "agent_output"
    );
    
    return this.createSuccessResult(
      {
        progress_report: progressReport,
        has_character: hasCharacter,
        has_worldbook: hasWorldbook,
        completion_percentage: hasCharacter && hasWorldbook ? 100 : (hasCharacter || hasWorldbook ? 50 : 0)
      },
      {
        shouldContinue: true,
        reasoning: "Progress report generated successfully"
      }
    );
  }

  /**
   * Generate character-only output
   */
  private async generateCharacterOutput(context: BaseToolContext): Promise<ToolExecutionResult> {
    const { task_progress } = context;

    if (!task_progress.character_data) {
      return {
        success: false,
        error: "Cannot generate character output: Character data is missing",
        should_continue: true,
        reasoning: "Need character data to generate character output"
      };
    }

    const characterOutput = this.formatCharacterCard(task_progress.character_data);

    await this.addMessage(
      context.conversation_id, 
      "agent", 
      `🎭 **Character Card Generated**\n\n${characterOutput}`,
      "agent_output"
    );

    return this.createSuccessResult(
      {
        character_output: characterOutput,
        character_data: task_progress.character_data
      },
      {
        shouldContinue: true,
        reasoning: "Character output generated successfully"
      }
    );
  }

  /**
   * Generate worldbook-only output
   */
  private async generateWorldbookOutput(context: BaseToolContext): Promise<ToolExecutionResult> {
    const { task_progress } = context;

    if (!task_progress.worldbook_data || task_progress.worldbook_data.length === 0) {
      return {
        success: false,
        error: "Cannot generate worldbook output: Worldbook data is missing",
        should_continue: true,
        reasoning: "Need worldbook data to generate worldbook output"
      };
    }

    const worldbookOutput = this.formatWorldbookEntries(task_progress.worldbook_data);

    await this.addMessage(
      context.conversation_id, 
      "agent", 
      `📚 **Worldbook Generated** (${task_progress.worldbook_data.length} entries)\n\n${worldbookOutput}`,
      "agent_output"
    );

    return this.createSuccessResult(
      {
        worldbook_output: worldbookOutput,
        worldbook_data: task_progress.worldbook_data
      },
      {
        shouldContinue: true,
        reasoning: "Worldbook output generated successfully"
      }
    );
  }

  /**
   * Format character card for display
   */
  private formatCharacterCard(characterData: any): string {
    let output = `**${characterData.name}**\n\n`;
    output += `**Description:** ${characterData.description}\n\n`;
    output += `**Personality:** ${characterData.personality}\n\n`;
    
    if (characterData.scenario) {
      output += `**Scenario:** ${characterData.scenario}\n\n`;
    }
    
    if (characterData.first_mes) {
      output += `**First Message:** ${characterData.first_mes}\n\n`;
    }
    
    if (characterData.mes_example) {
      output += `**Example Messages:** ${characterData.mes_example}\n\n`;
    }
    
    if (characterData.tags && characterData.tags.length > 0) {
      output += `**Tags:** ${characterData.tags.join(", ")}\n\n`;
    }

    return output;
  }

  /**
   * Format worldbook entries for display
   */
  private formatWorldbookEntries(worldbookData: any[]): string {
    let output = "";
    
    for (let i = 0; i < Math.min(worldbookData.length, 5); i++) {
      const entry = worldbookData[i];
      output += `**${i + 1}. ${entry.comment}**\n`;
      output += `Keywords: ${entry.key.join(", ")}\n`;
      output += `${entry.content.substring(0, 200)}${entry.content.length > 200 ? "..." : ""}\n\n`;
    }
    
    if (worldbookData.length > 5) {
      output += `... and ${worldbookData.length - 5} more entries\n`;
    }

    return output;
  }
} 