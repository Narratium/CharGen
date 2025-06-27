import {
  SessionStatus,
  ToolType,
  ExecutionContext,
  ExecutionResult,
  ToolDecision,
  KnowledgeEntry,
  UserInteraction,
  ResearchState,
} from "../models/agent-model";
import { ResearchSessionOperations } from "../data/agent/agent-conversation-operations";
import { ToolRegistry } from "../tools/tool-registry";
import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

// Define user input callback type
type UserInputCallback = (message?: string) => Promise<string>;

/**
 * Agent Engine - Real-time Decision Architecture
 * Inspired by Jina AI DeepResearch: Keep searching, reading, reasoning until answer found
 * Enhanced with task decomposition and reflection capabilities
 */
export class AgentEngine {
  private conversationId: string;
  private userInputCallback?: UserInputCallback;
  private model: any; // LLM model instance

  constructor(conversationId: string, userInputCallback?: UserInputCallback) {
    this.conversationId = conversationId;
    this.userInputCallback = userInputCallback;
  }

  /**
   * Start the agent execution with real-time decision making
   */
  async start(userInputCallback?: UserInputCallback): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }> {
    try {
      if (userInputCallback) {
        this.userInputCallback = userInputCallback;
      }

      await ResearchSessionOperations.updateStatus(this.conversationId, SessionStatus.THINKING);
      
      // Initialize the model and perform task decomposition
      const context = await this.buildExecutionContext();
      this.model = this.createLLM(context.llm_config);
      
      // Initialize with task decomposition - inspired by DeepResearch
      await this.initializeWithTaskDecomposition(context);
      
      // Main execution loop - real-time decision making
      return await this.realTimeExecutionLoop();
      
    } catch (error) { 
      await ResearchSessionOperations.updateStatus(this.conversationId, SessionStatus.FAILED);
      
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Initialize session with task decomposition
   * Inspired by DeepResearch's approach to breaking down complex objectives
   */
  private async initializeWithTaskDecomposition(context: ExecutionContext): Promise<void> {
    console.log("🚀 Initializing session with task decomposition...");
    
    // Check if already initialized
    if (context.research_state.task_queue && context.research_state.task_queue.length > 0) {
      console.log("📋 Task queue already initialized, skipping decomposition");
      return;
    }

    const prompt = ChatPromptTemplate.fromTemplate(`
You are an expert task planner for character card and worldbook generation. 
Analyze the user's objective and decompose it into a structured task queue.

USER OBJECTIVE: {main_objective}

USER CONTEXT: {user_context}

DECOMPOSITION GUIDELINES:
1. Break down the main objective into 5-8 concrete, actionable tasks
2. Each task should be specific and measurable
3. Tasks should follow a logical progression for character/worldbook creation
4. Consider research, analysis, and generation phases
5. Include validation and refinement tasks

For character card generation, typical phases include:
- Character concept research
- Personality development
- Background and setting research
- Dialogue and interaction analysis
- Character card generation
- Quality review and refinement

For worldbook creation, consider:
- World concept and theme research
- Lore and history development
- Character relationship mapping
- Location and setting details
- Cultural and social aspects
- Worldbook entry generation

Return a structured task decomposition in JSON format:
{{
  "initial_tasks": [
    {{
      "id": "task_1",
      "description": "specific task description",
      "priority": 1-10,
      "reasoning": "why this task is important",
      "expected_outcome": "what should be achieved"
    }}
  ],
  "sub_questions": [
    "specific research question 1",
    "specific research question 2"
  ],
  "knowledge_gaps": [
    "information gap 1",
    "information gap 2"
  ],
  "decomposition_reasoning": "explanation of the task breakdown approach"
}}
    `);

    try {
      const response = await this.model.invoke([
        await prompt.format({
          main_objective: context.research_state.main_objective,
          user_context: this.buildUserContextSummary(context)
        }),
      ]);

      const decomposition = this.parseJSONResponse(response.content);
      
      // Create task entries from decomposition
      const taskQueue = decomposition.initial_tasks.map((task: any, index: number) => ({
        id: `init_task_${Date.now()}_${index}`,
        description: task.description,
        priority: task.priority || (5 + index), // Default priority with sequence
        status: "pending" as const,
        reasoning: task.reasoning || "Initial task decomposition"
      }));

      // Update research state with initial decomposition
      const stateUpdate = {
        task_queue: taskQueue,
        sub_questions: decomposition.sub_questions || [],
        knowledge_gaps: decomposition.knowledge_gaps || [],
        last_reflection: new Date().toISOString(),
        reflection_trigger: "initialization" as const,
      };

      await ResearchSessionOperations.updateResearchState(this.conversationId, stateUpdate);
      
      console.log(`✅ Task decomposition complete: ${taskQueue.length} tasks created`);
      console.log(`📝 Sub-questions: ${decomposition.sub_questions?.length || 0}`);
      console.log(`❓ Knowledge gaps: ${decomposition.knowledge_gaps?.length || 0}`);

      // Add initialization message
      await ResearchSessionOperations.addMessage(this.conversationId, {
        role: "agent",
        content: `Task decomposition complete: ${taskQueue.length} initial tasks identified. ${decomposition.decomposition_reasoning}`,
        type: "agent_thinking",
        metadata: {
          tasks_created: taskQueue.length,
          sub_questions_generated: decomposition.sub_questions?.length || 0,
          knowledge_gaps_identified: decomposition.knowledge_gaps?.length || 0
        },
      });

    } catch (error) {
      console.error("❌ Task decomposition failed:", error);
      
      // Fallback to basic task structure
      const fallbackTasks = [
        {
          id: `fallback_task_${Date.now()}_1`,
          description: "Research character background and personality traits",
          priority: 8,
          status: "pending" as const,
          reasoning: "Fallback task - decomposition failed"
        },
        {
          id: `fallback_task_${Date.now()}_2`,
          description: "Generate character card with basic information",
          priority: 6,
          status: "pending" as const,
          reasoning: "Fallback task - decomposition failed"
        }
      ];

      await ResearchSessionOperations.updateResearchState(this.conversationId, {
        task_queue: fallbackTasks,
      });
    }
  }

  /**
   * Real-time execution loop - core planning and decision making
   * Based on DeepResearch philosophy: continuous search and reasoning
   */
  private async realTimeExecutionLoop(): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }> {
    const conversation = await ResearchSessionOperations.getConversationById(this.conversationId);
    if (!conversation) throw new Error("Conversation not found");

    let iteration = 0;
    const maxIterations = conversation.execution_info.max_iterations;
    const tokenBudget = conversation.execution_info.token_budget;
    let usedTokens = conversation.execution_info.total_tokens_used || 0;

    while (iteration < maxIterations && usedTokens < tokenBudget) {
      iteration++;
      await ResearchSessionOperations.incrementIteration(this.conversationId);

      // Get current context
      const context = await this.buildExecutionContext();
      
      // Real-time planning: What should we do next?
      const decision = await this.makeRealTimeDecision(context);
      
      if (!decision) {
        console.log("🎯 No more actions needed - task complete");
        break;
      }

      console.log(`🔄 [Iteration ${iteration}] Decided: ${decision.tool} - ${decision.reasoning}`);

      // Execute the decided tool
      const result = await this.executeToolDecision(decision, context);
      usedTokens += result.tokens_used || 0;

      // Update conversation state
      await this.updateConversationState(result);

      // Handle user input requirement
      if (decision.tool === ToolType.ASK_USER && result.success) {
        if (!this.userInputCallback) {
          throw new Error("User input required but no callback provided");
        }

        await ResearchSessionOperations.updateStatus(this.conversationId, SessionStatus.WAITING_USER);
        
        const userInput = await this.userInputCallback(result.result?.message || "I need more information from you.");
        
        // Add user input and update questions array
        await this.addUserInput(userInput);
        
        await ResearchSessionOperations.updateStatus(this.conversationId, SessionStatus.THINKING);
        continue;
      }

      // If OUTPUT tool was used, evaluate results
      if (decision.tool === ToolType.OUTPUT && result.success) {
        const isComplete = await this.evaluateOutput(result.result, context);
        if (isComplete) {
          console.log("✅ Task completed successfully");
          
          // Update character progress with the output
          if (result.result.GenerationOutputUpdate) {
            await ResearchSessionOperations.updateGenerationOutput(
              this.conversationId, 
              result.result.GenerationOutputUpdate
            );
          }
          
          break;
        } else {
          console.log("🔄 Output needs improvement, continuing...");
          await this.updateTasksAfterEvaluation(context);
        }
      }

      // If REFLECT tool was used, update task queue and research state
      if (decision.tool === ToolType.REFLECT && result.success && result.result?.ResearchStateUpdate) {
        console.log("🔄 Updating research state from reflection...");
        await ResearchSessionOperations.updateResearchState(
          this.conversationId, 
          result.result.ResearchStateUpdate
        );
        
        // Log reflection results
        if (result.result.task_updates) {
          console.log(`📋 Task updates: +${result.result.task_updates.added} new, ~${result.result.task_updates.updated} modified`);
        }
        
        if (result.result.new_sub_questions?.length > 0) {
          console.log(`❓ New sub-questions: ${result.result.new_sub_questions.length}`);
        }
      }

      // Update knowledge base if needed
      if (result.knowledge_updates && result.knowledge_updates.length > 0) {
        await this.updateKnowledgeBase(result.knowledge_updates);
      }

      // Update user questions if needed
      if (result.interaction_updates && result.interaction_updates.length > 0) {
        await this.updateUserInteractions(result.interaction_updates);
      }

      if (!result.should_continue) {
        break;
      }

      // Small delay to prevent tight loops
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Final completion check
    const finalContext = await this.buildExecutionContext();
    const completion = finalContext.research_state.progress;
    
    if (completion.answer_confidence >= 80 && completion.information_quality >= 70) {
      await ResearchSessionOperations.updateStatus(this.conversationId, SessionStatus.COMPLETED);
      return {
        success: true,
        result: await this.generateFinalResult(),
      };
    } else {
      return {
        success: false,
        error: usedTokens >= tokenBudget ? "Token budget exceeded" : "Maximum iterations reached without completion",
      };
    }
  }

  /**
   * Core planning module - real-time decision making
   * Inspired by DeepResearch: analyze current state and decide next action
   * Enhanced with reflection capabilities and task queue management
   */
  private async makeRealTimeDecision(context: ExecutionContext): Promise<ToolDecision | null> {
    // Get detailed tool information including parameters
    const availableTools = ToolRegistry.getDetailedToolsInfo();
    
    // Check if reflection is needed
    const shouldReflect = this.shouldTriggerReflection(context);
    
    const prompt = ChatPromptTemplate.fromTemplate(`
You are an intelligent agent that helps generate character cards and worldbooks. 
Analyze the current state and decide what tool to use next with appropriate parameters.

Available Tools:
{available_tools}

Current State:
Main Objective: {main_objective}

Task Queue Status:
{task_queue_status}

Sub-questions: {sub_questions}
Knowledge Gaps: {knowledge_gaps}

Completion Status:
- Search Coverage: {search_coverage}%
- Information Quality: {information_quality}%
- Answer Confidence: {answer_confidence}%
- User Satisfaction: {user_satisfaction}%

Recent Conversation:
{recent_conversation}

Knowledge Base Entries: {knowledge_count}
User Questions: {user_questions}

Reflection Status:
- Last Reflection: {last_reflection}
- Should Reflect: {should_reflect}
- Reflection Trigger: {reflection_trigger}

DECISION GUIDELINES:
1. **REFLECT**: Use when {should_reflect} is true, or when:
   - Progress seems stuck (no improvement in 3+ iterations)
   - Task queue needs updating based on new information
   - Major knowledge gaps identified
   - User requirements have changed

2. **SEARCH**: Use when:
   - Knowledge gaps exist and search coverage < 80%
   - Sub-questions need answers
   - Specific information is missing

3. **ASK_USER**: Use when:
   - Information is unclear or user requirements need clarification
   - User input would significantly improve direction

4. **OUTPUT**: Use when:
   - Answer confidence > 70% and information quality > 60%
   - Task queue shows sufficient completion
   - Ready to generate character/worldbook content

5. **NULL**: Return when task is essentially complete

Return your decision in JSON format:
{{
  "tool": "REFLECT|SEARCH|ASK_USER|OUTPUT|null",
  "parameters": {{}},
  "reasoning": "why this tool is needed now",
  "priority": 1-10
}}
    `);

    try {
      const response = await this.model.invoke([
        await prompt.format({
          available_tools: JSON.stringify(availableTools, null, 2),
          main_objective: context.research_state.main_objective,
          task_queue_status: this.buildTaskQueueSummary(context),
          sub_questions: context.research_state.sub_questions?.join(", ") || "None",
          knowledge_gaps: context.research_state.knowledge_gaps?.join(", ") || "Unknown",
          search_coverage: context.research_state.progress?.search_coverage || 0,
          information_quality: context.research_state.progress?.information_quality || 0,
          answer_confidence: context.research_state.progress?.answer_confidence || 0,
          user_satisfaction: context.research_state.progress?.user_satisfaction || 0,
          recent_conversation: this.buildRecentConversationSummary(context.message_history),
          knowledge_count: context.research_state.knowledge_base?.length || 0,
          user_questions: JSON.stringify(context.research_state.user_interactions || []),
          last_reflection: context.research_state.last_reflection || "Never",
          should_reflect: shouldReflect,
          reflection_trigger: this.getReflectionTriggerReason(context)
        }),
      ]);

      const content = response.content as string;
      const decision = JSON.parse(content);

      if (decision.tool === "null" || !decision.tool) {
        return null;
      }

      return {
        tool: decision.tool as ToolType,
        parameters: decision.parameters || {},
        reasoning: decision.reasoning,
        priority: decision.priority || 5,
      };
    } catch (error) {
      console.error("Error in makeRealTimeDecision:", error);
      return null;
    }
  }

  /**
   * Determine if reflection should be triggered
   */
  private shouldTriggerReflection(context: ExecutionContext): boolean {
    const state = context.research_state;
    const now = new Date();
    
    // Never reflected before
    if (!state.last_reflection) {
      return false; // Skip initial reflection since we just decomposed
    }
    
    const lastReflection = new Date(state.last_reflection);
    const timeSinceReflection = now.getTime() - lastReflection.getTime();
    const minutesSinceReflection = timeSinceReflection / (1000 * 60);
    
    // Time-based trigger (every 10 minutes of activity)
    if (minutesSinceReflection > 10) {
      return true;
    }
    
    // Progress-based triggers
    const progress = state.progress;
    
    // Low progress after some time
    if (minutesSinceReflection > 5 && 
        progress.answer_confidence < 40 && 
        progress.information_quality < 50) {
      return true;
    }
    
    // Many pending tasks without progress
    const pendingTasks = state.task_queue?.filter(t => t.status === "pending").length || 0;
    const completedTasks = state.task_queue?.filter(t => t.status === "completed").length || 0;
    
    if (pendingTasks > 5 && completedTasks === 0 && minutesSinceReflection > 3) {
      return true;
    }
    
    // Knowledge gaps accumulating
    if (state.knowledge_gaps && state.knowledge_gaps.length > 5 && minutesSinceReflection > 5) {
      return true;
    }
    
    return false;
  }

  /**
   * Get the reason why reflection should be triggered
   */
  private getReflectionTriggerReason(context: ExecutionContext): string {
    const state = context.research_state;
    
    if (!state.last_reflection) {
      return "initialization";
    }
    
    const now = new Date();
    const lastReflection = new Date(state.last_reflection);
    const minutesSinceReflection = (now.getTime() - lastReflection.getTime()) / (1000 * 60);
    
    if (minutesSinceReflection > 10) {
      return "auto";
    }
    
    const progress = state.progress;
    if (progress.answer_confidence < 40 && progress.information_quality < 50) {
      return "stuck";
    }
    
    const pendingTasks = state.task_queue?.filter(t => t.status === "pending").length || 0;
    if (pendingTasks > 5) {
      return "task_overflow";
    }
    
    if (state.knowledge_gaps && state.knowledge_gaps.length > 5) {
      return "knowledge_gaps";
    }
    
    return "auto";
  }

  /**
   * Build task queue summary for decision making
   */
  private buildTaskQueueSummary(context: ExecutionContext): string {
    const queue = context.research_state.task_queue || [];
    const pending = queue.filter(t => t.status === "pending");
    const active = queue.filter(t => t.status === "active");
    const completed = queue.filter(t => t.status === "completed");
    
    const summary = [`Total Tasks: ${queue.length}`];
    
    if (pending.length > 0) {
      summary.push(`Pending (${pending.length}): ${pending.slice(0, 3).map(t => t.description).join(", ")}${pending.length > 3 ? "..." : ""}`);
    }
    
    if (active.length > 0) {
      summary.push(`Active (${active.length}): ${active.map(t => t.description).join(", ")}`);
    }
    
    if (completed.length > 0) {
      summary.push(`Completed (${completed.length}): ${completed.slice(-2).map(t => t.description).join(", ")}`);
    }
    
    return summary.join("\n");
  }

  /**
   * Execute a tool decision
   */
  private async executeToolDecision(
    decision: ToolDecision, 
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    await ResearchSessionOperations.updateStatus(this.conversationId, SessionStatus.EXECUTING);

    // Add execution message
    await ResearchSessionOperations.addMessage(this.conversationId, {
      role: "agent",
      content: `Executing: ${decision.tool} - ${decision.reasoning}`,
      type: "agent_action",
      metadata: {
        tool_used: decision.tool,
        reasoning: decision.reasoning,
      },
    });

    try {
      return await ToolRegistry.executeToolDecision(decision, context);
    } catch (error) {
      console.error(`❌ Tool execution failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        should_continue: true,
      };
    }
  }

  /**
   * Evaluate output quality - only after OUTPUT tool usage
   */
  private async evaluateOutput(output: any, context: ExecutionContext): Promise<boolean> {
    const prompt = ChatPromptTemplate.fromTemplate(`
Evaluate the quality of this character card and worldbook output.

Output to evaluate:
{output}

User requirements and context:
{user_context}

Knowledge base used:
{knowledge_summary}

Rate the output on these criteria (0-100):
1. Completeness: Are all required elements present?
2. Quality: Is the content well-written and engaging?
3. Consistency: Is the output internally consistent?
4. User Requirements: Does it meet the user's specific needs?

Return evaluation in JSON format:
{{
  "completeness": 0-100,
  "quality": 0-100,
  "consistency": 0-100,
  "requirements_met": 0-100,
  "overall_score": 0-100,
  "is_acceptable": true/false,
  "improvement_needed": "specific areas that need work",
  "missing_elements": ["list", "of", "missing", "elements"]
}}
`);

    const llm = this.createLLM(context.llm_config);
    const chain = prompt.pipe(llm).pipe(new StringOutputParser());

    try {
      const response = await chain.invoke({
        output: JSON.stringify(output, null, 2),
        user_context: this.buildUserContextSummary(context),
        knowledge_summary: this.buildKnowledgeBaseSummary(context.research_state.knowledge_base),
      });

      const evaluation = this.parseJSONResponse(response);
      
      // Update completion status based on evaluation
      await this.updateCompletionStatus({
        answer_confidence: evaluation.overall_score,
        information_quality: evaluation.quality,
        user_satisfaction: evaluation.requirements_met,
      });

      return evaluation.is_acceptable && evaluation.overall_score >= 80;

    } catch (error) {
      console.error("❌ Output evaluation failed:", error);
      return false;
    }
  }

  /**
   * Update tasks after evaluation - remove completed, add new gaps
   */
  private async updateTasksAfterEvaluation(context: ExecutionContext): Promise<void> {
    // Update task state to reflect what needs improvement
    const conversation = await ResearchSessionOperations.getConversationById(this.conversationId);
    if (!conversation) return;

    // Mark current focus as completed and update with new focus
    const updatedResearchState = {
      completed_tasks: [...conversation.research_state.completed_tasks],
      updated_at: new Date().toISOString(),
    };

    await ResearchSessionOperations.updateResearchState(this.conversationId, updatedResearchState);
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async buildExecutionContext(): Promise<ExecutionContext> {
    const conversation = await ResearchSessionOperations.getConversationById(this.conversationId);
    if (!conversation) throw new Error("Conversation not found");

    return {
      session_id: this.conversationId,
      research_state: conversation.research_state,
      message_history: conversation.messages,
      llm_config: conversation.llm_config,  
    };
  }

  private createLLM(config: ExecutionContext["llm_config"]) {
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

  private parseJSONResponse(response: string): any {
    try {
      // Extract JSON from response if it's wrapped in markdown or other text
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(response);
    } catch (error) {
      console.error("Failed to parse JSON response:", response);
      throw new Error("Invalid JSON response from LLM");
    }
  }

  private buildRecentConversationSummary(messages: any[]): string {
    return messages.slice(-5).map(m => `${m.role}: ${m.content}`).join("\n");
  }

  private buildUserContextSummary(context: ExecutionContext): string {
    const UserInteractions = context.research_state.user_interactions
      .filter(q => q.is_initial)
      .map(q => q.question)
      .join("; ");
    
    return `User Questions: ${UserInteractions}\nMain Objective: ${context.research_state.main_objective}`;
  }

  private buildKnowledgeBaseSummary(knowledgeBase: KnowledgeEntry[]): string {
    return knowledgeBase
      .slice(0, 5) // Top 5 most relevant
      .map(k => `${k.source}: ${k.content.substring(0, 100)}...`)
      .join("\n");
  }

  private async updateConversationState(result: ExecutionResult): Promise<void> {
    // Update execution metadata with token usage
    if (result.tokens_used) {
      await ResearchSessionOperations.recordTokenUsage(this.conversationId, result.tokens_used);
    }
  }

  private async updateKnowledgeBase(updates: KnowledgeEntry[]): Promise<void> {
    await ResearchSessionOperations.addKnowledgeEntries(this.conversationId, updates);
  }

  private async updateUserInteractions(updates: UserInteraction[]): Promise<void> {
    await ResearchSessionOperations.addUserInteractions(this.conversationId, updates);
  }

  private async addUserInput(userInput: string): Promise<void> {
    // Add user message to conversation
    await ResearchSessionOperations.addMessage(this.conversationId, {
      role: "user",
      content: userInput,
      type: "user_input",
    });

    // Add to user questions array
    const newQuestion: UserInteraction = {
      id: `q_${Date.now()}`,
      question: userInput,
      is_initial: false,
      timestamp: new Date().toISOString(),
      status: "pending",
    };

    await this.updateUserInteractions([newQuestion]);
  }

  private async updateCompletionStatus(updates: Partial<ResearchState["progress"]>): Promise<void> {
    const conversation = await ResearchSessionOperations.getConversationById(this.conversationId);
    if (!conversation) return;

    // Update the completion status
    Object.assign(conversation.research_state.progress, updates);
    
    // Update the entire task state
    await ResearchSessionOperations.updateResearchState(this.conversationId, {
      progress: conversation.research_state.progress,
    });
  }

  private async generateFinalResult(): Promise<any> {
    const conversation = await ResearchSessionOperations.getConversationById(this.conversationId);
    if (!conversation) return null;

    return {
      character_data: conversation.generation_output.character_data,
      worldbook_data: conversation.generation_output.worldbook_data,
      quality_metrics: conversation.generation_output.quality_metrics,
      knowledge_base: conversation.research_state.knowledge_base,
      completion_status: conversation.research_state.progress,
    };
  }
} 
 
