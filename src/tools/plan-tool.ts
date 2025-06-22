import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { BaseTool } from "./base-tool";
import { ToolType, ToolExecutionContext, ToolExecutionResult, PlanTask } from "../models/agent-model";
import { PlanPoolOperations } from "../data/agent/plan-pool-operations";
import { ThoughtBufferOperations } from "../data/agent/thought-buffer-operations";

/**
 * Plan Tool - Core planning and replanning functionality
 * This tool is called at the beginning and when replanning is needed
 */
export class PlanTool extends BaseTool {
  readonly toolType = ToolType.PLAN;
  readonly name = "Plan Manager";
  readonly description = "Create initial plans and update execution strategy based on current progress";

  async executeTask(task: PlanTask, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    const planType = task.parameters.type || "initial";
    console.log(`📋 [Plan Tool] Executing plan task: ${planType}`);
    
    if (planType === "initial") {
      console.log("🎯 [Plan Tool] Creating initial execution plan...");
      return await this.createInitialPlan(task, context);
    } else if (planType === "replan") {
      console.log("🔄 [Plan Tool] Updating execution plan...");
      return await this.updatePlan(task, context);
    } else if (planType === "evaluate") {
      console.log("📊 [Plan Tool] Evaluating progress...");
      return await this.evaluateProgress(task, context);
    } else if (planType === "failure_analysis") {
      console.log("⚠️  [Plan Tool] Analyzing failure patterns...");
      return await this.analyzeFailures(task, context);
    }

    console.log(`❌ [Plan Tool] Unknown plan type: ${planType}`);
    return {
      success: false,
      error: "Unknown plan type",
      should_continue: true,
    };
  }

  /**
   * Create the initial execution plan
   */
  private async createInitialPlan(task: PlanTask, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    console.log("🎯 [Plan Tool] Starting initial plan creation...");
    console.log(`📝 [Plan Tool] User request: ${context.plan_pool.context.user_request}`);
    
    await this.addThought(
      context.conversation_id,
      "reasoning",
      "Creating initial execution plan based on user request",
      task.id,
    );

    try {
      console.log("🤖 [Plan Tool] Generating plan with LLM...");
      const planData = await this.generatePlanWithLLM(context, "initial");
      console.log(`✅ [Plan Tool] LLM generated plan: ${planData.goals?.length || 0} goals, ${planData.tasks?.length || 0} tasks`);
      
      // Create goal tree
      for (const goal of planData.goals || []) {
        await PlanPoolOperations.addGoal(context.conversation_id, {
          description: goal.description,
          type: goal.type,
          parent_id: goal.parent_id,
          children: [],
          status: "pending",
          metadata: goal.metadata || {},
        });
      }
      
      // Create initial tasks
      for (const taskData of planData.tasks || []) {
        await PlanPoolOperations.addTask(context.conversation_id, {
          description: taskData.description,
          tool: taskData.tool,
          parameters: taskData.parameters || {},
          dependencies: taskData.dependencies || [],
          status: "pending",
          reasoning: taskData.reasoning,
          priority: taskData.priority || 5,
        });
      }

      // Record planning decision
      await ThoughtBufferOperations.addDecision(context.conversation_id, {
        decision: "Created initial execution plan",
        reasoning: planData.reasoning || "Initial planning completed based on user request",
        alternatives_considered: planData.alternatives || [],
        confidence: planData.confidence || 0.8,
      });

      await this.addMessage(
        context.conversation_id,
        "agent",
        `📋 **Initial Plan Created**\n\n**Goals:** ${planData.goals?.length || 0}\n**Tasks:** ${planData.tasks?.length || 0}\n\n${planData.reasoning}`,
        "agent_thinking",
      );

      return {
        success: true,
        result: {
          plan_type: "initial",
          goals_created: planData.goals?.length || 0,
          tasks_created: planData.tasks?.length || 0,
          reasoning: planData.reasoning,
        },
        should_continue: true,
      };

    } catch (error) {
      console.error("❌ [Plan Tool] Initial planning failed:", error);
      
      // Create fallback plan
      console.log("🔄 [Plan Tool] Creating fallback plan...");
      await this.createFallbackPlan(context);
      console.log("✅ [Plan Tool] Fallback plan created");
      
      return {
        success: true,
        result: { plan_type: "fallback" },
        should_continue: true,
      };
    }
  }

  /**
   * Update the current plan based on progress
   */
  private async updatePlan(task: PlanTask, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    await this.addThought(
      context.conversation_id,
      "reasoning",
      "Evaluating current progress and updating execution plan",
      task.id,
    );

    try {
      const planUpdate = await this.generatePlanWithLLM(context, "replan");
      
      // Add new tasks if any
      for (const taskData of planUpdate.new_tasks || []) {
        await PlanPoolOperations.addTask(context.conversation_id, {
          description: taskData.description,
          tool: taskData.tool,
          parameters: taskData.parameters || {},
          dependencies: taskData.dependencies || [],
          status: "pending",
          reasoning: taskData.reasoning,
          priority: taskData.priority || 5,
        });
      }

      // Update plan context
      if (planUpdate.context_updates) {
        await PlanPoolOperations.updatePlanContext(context.conversation_id, planUpdate.context_updates);
      }

      // Record replanning decision
      await ThoughtBufferOperations.addDecision(context.conversation_id, {
        decision: "Updated execution plan",
        reasoning: planUpdate.reasoning || "Plan updated based on current progress",
        alternatives_considered: planUpdate.alternatives || [],
        confidence: planUpdate.confidence || 0.7,
      });

      await this.addMessage(
        context.conversation_id,
        "agent",
        `🔄 **Plan Updated**\n\n**New Tasks:** ${planUpdate.new_tasks?.length || 0}\n\n${planUpdate.reasoning}`,
        "agent_thinking",
      );

      return {
        success: true,
        result: {
          plan_type: "update",
          new_tasks: planUpdate.new_tasks?.length || 0,
          reasoning: planUpdate.reasoning,
        },
        should_continue: true,
      };

    } catch (error) {
      console.error("Plan update failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Plan update failed",
        should_continue: true,
      };
    }
  }

  /**
   * Evaluate current progress and determine next steps
   */
  private async evaluateProgress(task: PlanTask, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    await this.addThought(
      context.conversation_id,
      "reasoning",
      "Evaluating current progress to determine completion status",
      task.id,
    );

    const hasCharacterData = !!context.current_result.character_data;
    const hasWorldbookData = !!context.current_result.worldbook_data && context.current_result.worldbook_data.length > 0;
    const completedTasks = context.plan_pool.completed_tasks.length;
    const pendingTasks = context.plan_pool.current_tasks.filter(t => t.status === "pending").length;

    const evaluationResult = {
      character_completed: hasCharacterData,
      worldbook_completed: hasWorldbookData,
      completed_tasks: completedTasks,
      pending_tasks: pendingTasks,
      overall_progress: completedTasks / (completedTasks + pendingTasks) * 100,
      is_complete: hasCharacterData && hasWorldbookData,
      next_action: this.determineNextAction(hasCharacterData, hasWorldbookData, pendingTasks),
    };

    await this.addMessage(
      context.conversation_id,
      "agent",
      `📊 **Progress Evaluation**\n\n✅ Character: ${hasCharacterData ? "Complete" : "Pending"}\n✅ Worldbook: ${hasWorldbookData ? "Complete" : "Pending"}\n📈 Progress: ${evaluationResult.overall_progress.toFixed(1)}%\n🎯 Next: ${evaluationResult.next_action}`,
      "agent_thinking",
    );

    return {
      success: true,
      result: evaluationResult,
      should_continue: !evaluationResult.is_complete,
    };
  }

  /**
   * Generate plan using LLM
   */
  private async generatePlanWithLLM(context: ToolExecutionContext, type: "initial" | "replan"): Promise<any> {
    const llm = this.createLLM(context.llm_config);
    
    const prompt = type === "initial" 
      ? this.createInitialPlanningPrompt(context)
      : this.createReplanningPrompt(context);
    
    const response = await prompt.pipe(llm).pipe(new StringOutputParser()).invoke({});
    
    // Clean up response to extract JSON
    const cleanedResponse = this.extractJsonFromResponse(response);
    return JSON.parse(cleanedResponse);
  }

  /**
   * Extract JSON from response that might contain markdown code blocks
   */
  private extractJsonFromResponse(response: string): string {
    // Remove markdown code blocks if present
    let cleaned = response.trim();
    
    // Remove ```json and ``` if present
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    
    // Find JSON object boundaries
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}') + 1;
    
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      cleaned = cleaned.substring(jsonStart, jsonEnd);
    }
    
    return cleaned.trim();
  }

  /**
   * Create initial planning prompt
   */
  private createInitialPlanningPrompt(context: ToolExecutionContext) {
    const availableTools = ["ASK_USER", "SEARCH", "OUTPUT", "UPDATE_PLAN"];
    const toolsDescription = availableTools.map(tool => {
      switch (tool) {
      case "ASK_USER": return "- ASK_USER: Ask user for additional information or clarification";
      case "SEARCH": return "- SEARCH: Search for inspiration, references, and creative ideas";
      case "OUTPUT": return "- OUTPUT: Generate character data and worldbook entries";
      case "UPDATE_PLAN": return "- UPDATE_PLAN: Update the current execution plan";
      default: return `- ${tool}: Unknown tool`;
      }
    }).join("\n");

    // Include failure history information
    const failureHistory = context.plan_pool.context.failure_history;
    const hasFailures = Object.keys(failureHistory.failed_tool_attempts).length > 0;
    const failureInfo = hasFailures ? `
IMPORTANT - Historical Failures to Consider:
${Object.entries(failureHistory.failed_tool_attempts).map(([tool, count]) => 
  `- ${tool}: Failed ${count} time(s)`).join('\n')}

Recent Failure Details:
${failureHistory.recent_failures.slice(-3).map(f => 
  `- ${f.tool}: "${f.description}" failed with: ${f.error} (Attempt #${f.attempt_count})`).join('\n')}

When creating the plan, if a tool has failed multiple times (3+), consider alternative approaches or different tools to achieve the same goal.` : "";

    const systemPrompt = `You are an intelligent planning agent for character and worldbook generation. Create a detailed execution plan.

Available tools:
${toolsDescription}
${failureInfo}

Create a plan with goals and tasks. Each tool will determine its own execution details based on the task description.

CRITICAL: If any tool has failed 3+ times, avoid using it for similar tasks and consider alternative approaches.

Respond in JSON format:
{{
  "reasoning": "Your reasoning for this plan, including consideration of any failure patterns",
  "confidence": 0.8,
  "goals": [
    {{
      "description": "Goal description",
      "type": "main_goal|sub_goal",
      "parent_id": "parent_goal_id_if_any",
      "metadata": {{}}
    }}
  ],
  "tasks": [
    {{
      "description": "Clear description of what needs to be accomplished", 
      "tool": "TOOL_NAME",
      "dependencies": [],
      "priority": 1-10,
      "reasoning": "Why this task is needed and why this tool was chosen"
    }}
  ],
  "alternatives": ["Alternative approaches considered, especially for previously failed tools"]
}}`;

    return ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      ["human", `User request: ${context.plan_pool.context.user_request}

Create an initial plan to generate a character and worldbook. Focus on:
1. Understanding user requirements first
2. Gathering inspiration and references
3. Generating character data
4. Creating worldbook entries

Make the plan comprehensive but efficient.`],
    ]);
  }

  /**
   * Create replanning prompt
   */
  private createReplanningPrompt(context: ToolExecutionContext) {
    const availableTools = ["ASK_USER", "SEARCH", "OUTPUT", "UPDATE_PLAN"];
    const toolsDescription = availableTools.map(tool => {
      switch (tool) {
      case "ASK_USER": return "- ASK_USER: Ask user for additional information or clarification";
      case "SEARCH": return "- SEARCH: Search for inspiration, references, and creative ideas";
      case "OUTPUT": return "- OUTPUT: Generate character data and worldbook entries";
      case "UPDATE_PLAN": return "- UPDATE_PLAN: Update the current execution plan";
      default: return `- ${tool}: Unknown tool`;
      }
    }).join("\n");

    // Include failure history information
    const failureHistory = context.plan_pool.context.failure_history;
    const hasFailures = Object.keys(failureHistory.failed_tool_attempts).length > 0;
    const failureInfo = hasFailures ? `

IMPORTANT - Failure Analysis:
${Object.entries(failureHistory.failed_tool_attempts).map(([tool, count]) => 
  `- ${tool}: Failed ${count} time(s) - ${count >= 3 ? 'AVOID this tool for similar tasks!' : 'Use with caution'}`).join('\n')}

Recent Failures (learn from these):
${failureHistory.recent_failures.slice(-5).map(f => 
  `- ${f.tool}: "${f.description}" failed: ${f.error} (Attempt #${f.attempt_count})`).join('\n')}` : "";

    const systemPrompt = `You are updating an existing plan based on current progress. Analyze what has been completed and what still needs to be done.

Available tools:
${toolsDescription}
${failureInfo}

Current state:
- Completed tasks: ${context.plan_pool.completed_tasks.length}
- Current tasks: ${context.plan_pool.current_tasks.length}
- Character data: ${context.current_result.character_data ? "Generated" : "Not generated"}
- Worldbook data: ${context.current_result.worldbook_data ? "Generated" : "Not generated"}

CRITICAL RULES:
1. If a tool has failed 3+ times, DO NOT use it again for similar tasks
2. Consider why previous attempts failed and propose different approaches
3. Look for patterns in failures and avoid repeating them

Respond in JSON format:
{{
  "reasoning": "Why these updates are needed, including analysis of any failures",
  "confidence": 0.7,
  "new_tasks": [
    {{
      "description": "Clear description of what needs to be accomplished",
      "tool": "TOOL_NAME", 
      "dependencies": [],
      "priority": 1-10,
      "reasoning": "Why this task is needed and why this tool was chosen (considering failure history)"
    }}
  ],
  "context_updates": {{
    "current_focus": "What to focus on next"
  }},
  "alternatives": ["Alternative approaches considered, especially to avoid repeated failures"]
}}`;

    return ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      ["human", `Current plan status:
Completed: ${JSON.stringify(context.plan_pool.completed_tasks.map(t => t.description))}
Pending: ${JSON.stringify(context.plan_pool.current_tasks.map(t => t.description))}
Current focus: ${context.plan_pool.context.current_focus}

What should be done next to complete the character and worldbook generation?`],
    ]);
  }

  /**
   * Create fallback plan when LLM planning fails
   */
  private async createFallbackPlan(context: ToolExecutionContext): Promise<void> {
    const basicTasks = [
      {
        description: "Gather user requirements and preferences for character and worldbook creation",
        tool: ToolType.ASK_USER,
        parameters: {},
        dependencies: [],
        status: "pending" as const,
        priority: 10,
        reasoning: "Need to understand user requirements",
      },
      {
        description: "Search for creative inspiration and references relevant to the user's request",
        tool: ToolType.SEARCH,
        parameters: {},
        dependencies: [],
        status: "pending" as const,
        priority: 8,
        reasoning: "Gather creative inspiration",
      },
      {
        description: "Generate character data based on user requirements and inspiration",
        tool: ToolType.OUTPUT,
        parameters: {},
        dependencies: [],
        status: "pending" as const,
        priority: 6,
        reasoning: "Create the character",
      },
      {
        description: "Generate worldbook entries that complement the character and setting",
        tool: ToolType.OUTPUT,
        parameters: {},
        dependencies: [],
        status: "pending" as const,
        priority: 5,
        reasoning: "Create the worldbook",
      },
    ];

    for (const task of basicTasks) {
      await PlanPoolOperations.addTask(context.conversation_id, task);
    }
  }

  /**
   * Analyze failure patterns and suggest alternatives
   */
  private async analyzeFailures(task: PlanTask, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    await this.addThought(
      context.conversation_id,
      "reasoning",
      "Analyzing repeated failures to identify alternative strategies",
      task.id,
    );

    const failureHistory = context.plan_pool.context.failure_history;
    const criticallyFailedTools = Object.entries(failureHistory.failed_tool_attempts)
      .filter(([tool, count]) => count >= 3);

    const analysisResult = {
      critical_tools: criticallyFailedTools,
      total_failures: Object.values(failureHistory.failed_tool_attempts).reduce((a, b) => a + b, 0),
      recent_failure_patterns: this.identifyFailurePatterns(failureHistory.recent_failures),
      recommended_actions: this.suggestAlternatives(criticallyFailedTools, context),
    };

    await this.addMessage(
      context.conversation_id,
      "agent",
      `⚠️  **Failure Analysis Complete**\n\n**Critical Tools:** ${criticallyFailedTools.map(([tool, count]) => `${tool} (${count} failures)`).join(', ')}\n**Total Failures:** ${analysisResult.total_failures}\n\n**Recommendations:**\n${analysisResult.recommended_actions.join('\n')}`,
      "agent_thinking",
    );

    // Update plan context to reflect failure analysis
    await PlanPoolOperations.updatePlanContext(context.conversation_id, {
      current_focus: "Implementing alternative strategies due to repeated failures",
    });

    return {
      success: true,
      result: analysisResult,
      should_continue: true,
      should_update_plan: true,
    };
  }

  /**
   * Identify patterns in recent failures
   */
  private identifyFailurePatterns(recentFailures: any[]): string[] {
    const patterns = [];
    const errorTypes = recentFailures.map(f => f.error.toLowerCase());
    
    if (errorTypes.some(e => e.includes('timeout') || e.includes('network'))) {
      patterns.push("Network/timeout issues detected");
    }
    if (errorTypes.some(e => e.includes('parse') || e.includes('json'))) {
      patterns.push("Data parsing issues detected");
    }
    if (errorTypes.some(e => e.includes('auth') || e.includes('key'))) {
      patterns.push("Authentication issues detected");
    }
    
    return patterns;
  }

  /**
   * Suggest alternative approaches for failed tools
   */
  private suggestAlternatives(criticallyFailedTools: [string, number][], context: ToolExecutionContext): string[] {
    const suggestions = [];
    
    for (const [tool, count] of criticallyFailedTools) {
      switch (tool) {
        case "SEARCH":
          suggestions.push("• Instead of SEARCH tool, use ASK_USER to gather inspiration and references directly");
          break;
        case "OUTPUT":
          suggestions.push("• Break OUTPUT tasks into smaller parts and ask user for input/validation");
          suggestions.push("• Use ASK_USER to gather more specific requirements before generating content");
          break;
        case "ASK_USER":
          suggestions.push("• Provide more specific and clear questions to the user");
          suggestions.push("• Use OUTPUT tool to generate example responses for user guidance");
          break;
        default:
          suggestions.push(`• Find alternative approach for ${tool} functionality`);
      }
    }
    
    if (suggestions.length === 0) {
      suggestions.push("• Consider manual intervention or simplified approach");
    }
    
    return suggestions;
  }

  /**
   * Determine next action based on current state
   */
  private determineNextAction(hasCharacter: boolean, hasWorldbook: boolean, pendingTasks: number): string {
    if (!hasCharacter && !hasWorldbook) {
      return "Start with character generation";
    } else if (hasCharacter && !hasWorldbook) {
      return "Focus on worldbook creation";
    } else if (!hasCharacter && hasWorldbook) {
      return "Complete character creation";
    } else if (pendingTasks > 0) {
      return "Complete remaining tasks";
    } else {
      return "Generation complete";
    }
  }
} 
