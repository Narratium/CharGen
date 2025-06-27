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
 * Following DeepResearch: Planning generates parameters, tools execute
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
      await this.initialize(context);
      
      // Main execution loop - real-time decision making
      return await this.executionLoop();
      
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
  private async initialize  (context: ExecutionContext): Promise<void> {
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
  private async executionLoop(): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }> {
    const session = await ResearchSessionOperations.getSessionById(this.conversationId);
    if (!session) throw new Error("Session not found");

    let iteration = 0;
    const maxIterations = session.execution_info.max_iterations;
    const tokenBudget = session.execution_info.token_budget;
    let usedTokens = session.execution_info.total_tokens_used || 0;

    while (iteration < maxIterations && usedTokens < tokenBudget) {
      iteration++;
      await ResearchSessionOperations.incrementIteration(this.conversationId);

      // Get current context
      const context = await this.buildExecutionContext();
      
      // Real-time planning: What should we do next?
      const decision = await this.selectNextDecision(context);
      
      if (!decision) {
        console.log("🎯 No more actions needed - task complete");
        break;
      }

      // Execute the decided tool
      const result = await this.executeDecision(decision, context);
      usedTokens += result.tokens_used || 0;

      // Handle ASK_USER tool - special case for user interaction flow control
      if (decision.tool === ToolType.ASK_USER && result.success) {
        if (!this.userInputCallback) {
          throw new Error("User input required but no callback provided");
        }

        await ResearchSessionOperations.updateStatus(this.conversationId, SessionStatus.WAITING_USER);
        
        const userInput = await this.userInputCallback(result.result?.message || "I need more information from you.");
        
        // Add user input and update questions array
        await ResearchSessionOperations.addUserInteractions(this.conversationId, [{
          id: `q_${Date.now()}`,
          question: userInput,
          is_initial: false,
          status: "pending",
        }]);
        
        await ResearchSessionOperations.updateStatus(this.conversationId, SessionStatus.THINKING);
        continue;
      }

      // Handle CHARACTER or WORLDBOOK tool - data updates and completion evaluation
      if ((decision.tool === ToolType.CHARACTER || decision.tool === ToolType.WORLDBOOK) && result.success) {
        console.log(`✅ ${decision.tool} execution completed with generated content`);
        
        // Update generation output with new data
        if (decision.tool === ToolType.CHARACTER && result.result?.character_data) {
          await ResearchSessionOperations.updateGenerationOutput(this.conversationId, {
            character_data: result.result.character_data,
          });
        }
        
        if (decision.tool === ToolType.WORLDBOOK && result.result?.worldbook_data) {
          await ResearchSessionOperations.updateGenerationOutput(this.conversationId, {
            worldbook_data: result.result.worldbook_data,
          });
        }
        
        // Check if we should continue or if task is complete
        const isComplete = await this.evaluateGenerationProgress(result.result, context, decision.tool);
        if (isComplete) {
          console.log("✅ Generation task completed successfully");
          break;
        } else {
          console.log("🔄 Generation needs improvement or additional work, continuing...");
        }
      }

      // Handle REFLECT tool - update research state and log results
      if (decision.tool === ToolType.REFLECT && result.success) {
        console.log("🔄 Reflection completed");
        
        // Update research state with new task queue from reflection
        if (result.result.updated_task_queue) {
          await ResearchSessionOperations.updateResearchState(this.conversationId, {
            task_queue: result.result.updated_task_queue,
            last_reflection: new Date().toISOString(),
            reflection_trigger: "manual"
          });
        }
        
        if (result.result.added_count > 0) {
          console.log(`📋 Added ${result.result.added_count} new tasks`);
        }
        
        if (result.result.decomposed_count > 0) {
          console.log(`🔄 Decomposed ${result.result.decomposed_count} complex tasks`);
        }
      }
      if (result.tokens_used) {
        await ResearchSessionOperations.recordTokenUsage(this.conversationId, result.tokens_used);
      }

      // Update knowledge base if tool provided knowledge updates
      if (result.knowledge_updates && result.knowledge_updates.length > 0) {
        await ResearchSessionOperations.addKnowledgeEntries(this.conversationId, result.knowledge_updates);
      }

      // Update user interactions if tool provided interaction updates  
      if (result.interaction_updates && result.interaction_updates.length > 0) {
        await ResearchSessionOperations.addUserInteractions(this.conversationId, result.interaction_updates);
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
   * Core planning module - real-time decision making with complete content generation
   * Following DeepResearch: planner generates ALL content, tools just store/process results
   */
  private async selectNextDecision(context: ExecutionContext): Promise<ToolDecision | null> {
    // Get detailed tool information in XML format to inject into the prompt
    const availableTools = ToolRegistry.getDetailedToolsInfo();
    
    // Check if reflection is needed
    const shouldReflect = this.shouldTriggerReflection(context);
    
    const prompt = ChatPromptTemplate.fromTemplate(`
<prompt>
  <system_role>
    You are a master planning agent for a character and world-building assistant.
    Your primary goal is to analyze the user's request, the current state of the project, and the available tools to decide the single best next action.
    You must think step-by-step and provide your reasoning, your chosen action, and the complete parameters for that action in the specified XML format.
  </system_role>

  <tools_schema>
    {available_tools}
  </tools_schema>

  <current_state>
    <main_objective>{main_objective}</main_objective>
    <task_queue>{task_queue_status}</task_queue>
    <knowledge_gaps>{knowledge_gaps}</knowledge_gaps>
    <generation_progress>
      <search_coverage>{search_coverage}%</search_coverage>
      <information_quality>{information_quality}%</information_quality>
      <answer_confidence>{answer_confidence}%</answer_confidence>
    </generation_progress>
    <conversation_history>{recent_conversation}</conversation_history>
    <knowledge_base>{knowledge_base}</knowledge_base>
    <user_requirements>{user_requirements}</user_requirements>
  </current_state>

  <instructions>
    1.  Carefully analyze the <current_state> and the <tools_schema>.
    2.  Determine the single most critical action to perform next to progress towards the <main_objective>.
    3.  If the project is drifting or stuck, consider using the REFLECT tool. Priority: {should_reflect}.
    4.  Construct your response meticulously following the <output_specification>.
  </instructions>

  <output_specification>
    You MUST respond using the following XML format. Do not include any other text, explanations, or formatting outside of the <response> block.

    <response>
      <think>
        Provide a detailed, step-by-step reasoning for your choice of action. Explain how this action helps achieve the main objective based on the current state.
      </think>
      <action>The name of the ONE tool you are choosing to use (e.g., SEARCH, CHARACTER, WORLDBOOK).</action>
      <parameters>
        <!--
        - Provide all parameters for the chosen action inside this block.
        - For complex types like 'object' or 'array', you MUST provide the value as a JSON string wrapped in a <![CDATA[...]]> block.
        - Example for SEARCH: <query>Search for dragon lore</query><focus>lore</focus>
        - Example for CHARACTER: <character_data><![CDATA[{{\"name\": \"Elara\", \"description\": \"A cunning sorceress...\"}}]]></character_data>
        - Example for WORLDBOOK: <worldbook_entry><![CDATA[{{\"key\": [\"magic\"], \"content\": \"Magic is volatile...\"}}]]></worldbook_entry>
        -->
      </parameters>
    </response>
  </output_specification>
</prompt>
    `);

    try {
      const response = await this.model.invoke([
        await prompt.format({
          available_tools: availableTools,
          main_objective: context.research_state.main_objective,
          task_queue_status: this.buildTaskQueueSummary(context),
          knowledge_gaps: context.research_state.knowledge_gaps?.join(", ") || "Unknown",
          search_coverage: context.research_state.progress?.search_coverage || 0,
          information_quality: context.research_state.progress?.information_quality || 0,
          answer_confidence: context.research_state.progress?.answer_confidence || 0,
          user_satisfaction: context.research_state.progress?.user_satisfaction || 0,
          recent_conversation: this.buildRecentConversationSummary(context.message_history),
          knowledge_base: this.buildKnowledgeBaseSummary(context.research_state.knowledge_base),
          user_requirements: this.buildUserInteractionsSummary(context.research_state.user_interactions),
          last_reflection: context.research_state.last_reflection || "Never",
          should_reflect: shouldReflect
        }),
      ]);

      const content = response.content as string;
      const decision = this.parseXMLResponse(content);

      if (decision.action === "null" || !decision.action) {
        return null;
      }

      return {
        tool: decision.action as ToolType,
        parameters: decision.parameters,
        reasoning: decision.think,
        priority: 5,
      };
    } catch (error) {
      console.error("Error in selectNextDecision:", error);
      return null;
    }
  }

  /**
   * Parses the XML response from the LLM to extract action, parameters, and reasoning.
   */
  private parseXMLResponse(xmlString: string): { think: string, action: string, parameters: Record<string, any> } {
    const think = xmlString.match(/<think>([\s\S]*?)<\/think>/)?.[1].trim() ?? 'No reasoning provided';
    const action = xmlString.match(/<action>([\s\S]*?)<\/action>/)?.[1].trim() ?? 'null';
    
    const paramsMatch = xmlString.match(/<parameters>([\s\S]*?)<\/parameters>/);
    const parameters: Record<string, any> = {};

    if (paramsMatch && paramsMatch[1]) {
        const paramsString = paramsMatch[1].trim();
        const paramRegex = /<(\w+)>([\s\S]*?)<\/(\1)>/g;
        let match;

        while ((match = paramRegex.exec(paramsString)) !== null) {
            const key = match[1];
            let value = match[2].trim();

            const cdataMatch = value.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
            if (cdataMatch) {
                try {
                    // It's a JSON string in CDATA, parse it
                    parameters[key] = JSON.parse(cdataMatch[1]);
                } catch (e) {
                    // Fallback to raw string if JSON parsing fails
                    parameters[key] = cdataMatch[1];
                }
            } else {
                // It's a simple string value
                parameters[key] = value;
            }
        }
    }

    return { think, action, parameters };
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
  private async executeDecision(
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
      };
    }
  }

  /**
   * Evaluate generation progress - for CHARACTER and WORLDBOOK tools
   */
  private async evaluateGenerationProgress(output: any, context: ExecutionContext, toolType: ToolType): Promise<boolean> {
    const prompt = ChatPromptTemplate.fromTemplate(`
<prompt>
  <system_role>
    You are an expert quality assurance agent. Your task is to evaluate the output of a generation tool ({tool_type}) and determine if it meets the required standards for the project.
  </system_role>

  <evaluation_context>
    <tool_used>{tool_type}</tool_used>
    <output_generated>
      <![CDATA[{output}]]>
    </output_generated>
    <user_requirements>
      {user_context}
    </user_requirements>
    <knowledge_base>
      {knowledge_summary}
    </knowledge_base>
    <current_project_progress>
      {current_progress}
    </current_project_progress>
  </evaluation_context>

  <instructions>
    1.  Review the <output_generated> in the context of the user's requirements and the project's knowledge base.
    2.  Assess the output based on the specific guidelines for the tool used.
        <guidelines tool="CHARACTER">
          - Completeness: Is the character well-developed? Are all key fields present?
          - Consistency: Does the character align with the knowledge base and user requirements?
          - Engagement: Is the personality distinctive? Is the dialogue high quality?
        </guidelines>
        <guidelines tool="WORLDBOOK">
          - Comprehensiveness: Are the entries useful and detailed?
          - Complementarity: Do the entries support the main character and world?
          - Coverage: Is there good coverage of the world? Are keywords well-chosen?
        </guidelines>
    3.  Provide your evaluation in the specified XML format below.
  </instructions>

  <output_specification>
    You MUST respond using the following XML format. Do not include any other text outside this block.

    <evaluation_response>
      <reasoning>Detailed explanation for your assessment of the output's quality and alignment.</reasoning>
      <quality_score>An overall quality score from 0 to 100.</quality_score>
      <completeness_score>A completeness score from 0 to 100.</completeness_score>
      <alignment_score>A user alignment score from 0 to 100.</alignment_score>
      <is_sufficient>true or false, based on whether the generation task is complete and meets a high standard (quality_score >= 80).</is_sufficient>
      <next_steps>
        <step>Actionable next step 1 to improve the output, if needed.</step>
        <step>Actionable next step 2.</step>
      </next_steps>
    </evaluation_response>
  </output_specification>
</prompt>`);

    const llm = this.createLLM(context.llm_config);
    const chain = prompt.pipe(llm).pipe(new StringOutputParser());

    try {
      const response = await chain.invoke({
        tool_type: toolType,
        output: JSON.stringify(output, null, 2),
        user_context: this.buildUserContextSummary(context),
        knowledge_summary: this.buildKnowledgeBaseSummary(context.research_state.knowledge_base),
        current_progress: this.buildProgressSummary(context)
      });

      const evaluation = this.parseEvaluationXMLResponse(response);
      
      // Update completion status based on evaluation
      await this.updateCompletionStatus({
        answer_confidence: evaluation.quality_score,
        information_quality: evaluation.completeness_score,
        user_satisfaction: evaluation.alignment_score,
      });

      return evaluation.is_sufficient;

    } catch (error) {
      console.error("❌ Generation evaluation failed:", error);
      return false;
    }
  }

  /**
   * Parses the XML evaluation response from the LLM.
   */
  private parseEvaluationXMLResponse(xmlString: string): {
    reasoning: string;
    quality_score: number;
    completeness_score: number;
    alignment_score: number;
    is_sufficient: boolean;
    next_steps: string[];
  } {
    const reasoning = xmlString.match(/<reasoning>([\s\S]*?)<\/reasoning>/)?.[1].trim() ?? 'No reasoning provided';
    const quality_score = parseInt(xmlString.match(/<quality_score>(\d+)<\/quality_score>/)?.[1] ?? '0', 10);
    const completeness_score = parseInt(xmlString.match(/<completeness_score>(\d+)<\/completeness_score>/)?.[1] ?? '0', 10);
    const alignment_score = parseInt(xmlString.match(/<alignment_score>(\d+)<\/alignment_score>/)?.[1] ?? '0', 10);
    const is_sufficient = xmlString.match(/<is_sufficient>(true|false)<\/is_sufficient>/)?.[1] === 'true';

    const next_steps: string[] = [];
    const stepsMatch = xmlString.match(/<next_steps>([\s\S]*?)<\/next_steps>/)?.[1] ?? '';
    const stepRegex = /<step>([\s\S]*?)<\/step>/g;
    let match;
    while ((match = stepRegex.exec(stepsMatch)) !== null) {
        next_steps.push(match[1].trim());
    }

    return { reasoning, quality_score, completeness_score, alignment_score, is_sufficient, next_steps };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async buildExecutionContext(): Promise<ExecutionContext> {
    const session = await ResearchSessionOperations.getSessionById(this.conversationId);
    if (!session) throw new Error("Session not found");

      return {
        session_id: this.conversationId,
        research_state: session.research_state,
        message_history: session.messages,
        llm_config: session.llm_config,  
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
    if (!knowledgeBase || knowledgeBase.length === 0) {
      return "No knowledge gathered yet.";
    }

    return knowledgeBase
      .slice(0, 5)
      .map(k => `- ${k.source}: ${k.content.substring(0, 100)}...`)
      .join("\n");
  }

  private buildUserInteractionsSummary(interactions: UserInteraction[]): string {
    if (!interactions || interactions.length === 0) {
      return "No user questions recorded.";
    }
    
    return interactions
      .map(q => `- ${q.is_initial ? '[Initial]' : '[Follow-up]'} ${q.question}`)
      .join("\n");
  }

  private buildProgressSummary(context: ExecutionContext): string {
    const progress = context.research_state.progress;
    return `Search: ${progress.search_coverage}%, Info: ${progress.information_quality}%, Confidence: ${progress.answer_confidence}%, Satisfaction: ${progress.user_satisfaction}%`;
  }

  private async updateSessionState(result: ExecutionResult): Promise<void> {
    // Update execution metadata with token usage
    if (result.tokens_used) {
      await ResearchSessionOperations.recordTokenUsage(this.conversationId, result.tokens_used);
    }
  }

  private async updateCompletionStatus(updates: Partial<ResearchState["progress"]>): Promise<void> {
    const session = await ResearchSessionOperations.getSessionById(this.conversationId);
    if (!session) return;

    // Update the completion status
    Object.assign(session.research_state.progress, updates);
    
    // Update the entire task state
    await ResearchSessionOperations.updateResearchState(this.conversationId, {
      progress: session.research_state.progress,
    });
  }

  private async generateFinalResult(): Promise<any> {
    const session = await ResearchSessionOperations.getSessionById(this.conversationId);
    if (!session) return null;

    return {
      character_data: session.generation_output.character_data,
      worldbook_data: session.generation_output.worldbook_data,
      knowledge_base: session.research_state.knowledge_base,
      completion_status: session.research_state.progress,
    };
  }
} 
 
 
