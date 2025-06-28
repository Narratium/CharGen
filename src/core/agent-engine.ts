import {
  SessionStatus,
  ToolType,
  ExecutionContext,
  ExecutionResult,
  ToolDecision,
  KnowledgeEntry,
  UserInteraction,
  ResearchState,
  GenerationOutput,
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
  private async initialize (context: ExecutionContext): Promise<void> {
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

Respond using the following XML format:
<task_decomposition>
  <initial_tasks>
    <task>
      <description>specific task description</description>
      <reasoning>why this task is important</reasoning>
      <expected_outcome>what should be achieved</expected_outcome>
    </task>
    <!-- Add more tasks as needed -->
  </initial_tasks>
  <knowledge_gaps>
    <gap>information gap 1</gap>
    <gap>information gap 2</gap>
    <!-- Add more gaps as needed -->
  </knowledge_gaps>
  <decomposition_reasoning>explanation of the task breakdown approach</decomposition_reasoning>
</task_decomposition>
    `);

    try {
      const response = await this.model.invoke([
        await prompt.format({
          main_objective: context.research_state.main_objective
        }),
      ]);

      const content = response.content as string;
      
      // Parse XML response directly
      const taskMatches = [...content.matchAll(/<task>([\s\S]*?)<\/task>/g)];
      const taskQueue = taskMatches.map((match, index) => {
        const taskContent = match[1];
        const description = taskContent.match(/<description>([\s\S]*?)<\/description>/)?.[1]?.trim() || `Task ${index + 1}`;
        const reasoning = taskContent.match(/<reasoning>([\s\S]*?)<\/reasoning>/)?.[1]?.trim() || "Initial task decomposition";
        
        return {
          id: `init_task_${Date.now()}_${index}`,
          description,
          reasoning
        };
      });

      // Parse knowledge gaps
      const gapMatches = [...content.matchAll(/<gap>([\s\S]*?)<\/gap>/g)];
      const knowledgeGaps = gapMatches.map(match => match[1]?.trim()).filter(gap => gap);

      // Parse decomposition reasoning
      const decompositionReasoning = content.match(/<decomposition_reasoning>([\s\S]*?)<\/decomposition_reasoning>/)?.[1]?.trim() || "Task decomposition completed";

      // Update research state with initial decomposition
      const stateUpdate = {
        task_queue: taskQueue,
        knowledge_gaps: knowledgeGaps,
      };

      await ResearchSessionOperations.updateResearchState(this.conversationId, stateUpdate);
      
      console.log(`✅ Task decomposition complete: ${taskQueue.length} tasks created`);
      console.log(`❓ Knowledge gaps: ${knowledgeGaps.length}`);

      // Add initialization message
      await ResearchSessionOperations.addMessage(this.conversationId, {
        role: "agent",
        content: `Task decomposition complete: ${taskQueue.length} initial tasks identified. ${decompositionReasoning}`,
        type: "agent_thinking",
        metadata: {
          tasks_created: taskQueue.length,
          knowledge_gaps_identified: knowledgeGaps.length
        },
      });

    } catch (error) {
      console.error("❌ Task decomposition failed:", error);
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
        console.log("🎯 No more decisions available");
        continue; // Continue to end of loop where task queue check happens
      }

      // Execute the decided tool
      const result = await this.executeDecision(decision, context);
      console.log("🔄 Execution result:", result);
      
      // Handle tool execution failure with LLM analysis
      if (!result.success) {
        console.error(`❌ Tool ${decision.tool} failed: ${result.error}`);
        await this.analyzeToolFailure(decision, result, context);
        continue; // Continue to next iteration despite tool failure
      }

      // Handle SEARCH tool - update knowledge base with search results
      if (decision.tool === ToolType.SEARCH && result.success) {
        console.log(`✅ SEARCH execution completed with ${result.result?.results_count || 0} knowledge entries`);
        
        if (result.result?.search_methods && result.result.search_methods.length > 0) {
          console.log(`🔍 Search methods used: ${result.result.search_methods.join(", ")}`);
        }
        
        if (result.result?.sources && result.result.sources.length > 0) {
          console.log(`📚 Top sources: ${result.result.sources.slice(0, 3).join(", ")}`);
        }
        
        // The SearchTool creates knowledge entries but we need to save them to the research state
        // Get the current session to update knowledge base
        const session = await ResearchSessionOperations.getSessionById(this.conversationId);
        if (session && result.result?.knowledge_entries && result.result.knowledge_entries.length > 0) {
          const updatedKnowledgeBase = [
            ...(session.research_state.knowledge_base || []),
            ...result.result.knowledge_entries
          ];
          
          await ResearchSessionOperations.updateResearchState(this.conversationId, {
            knowledge_base: updatedKnowledgeBase,
          });
          
          console.log(`📊 Knowledge base updated: added ${result.result.knowledge_entries.length} new entries (total: ${updatedKnowledgeBase.length})`);
        }
        
        continue;
      }

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

      // Handle CHARACTER or WORLDBOOK tool - data updates and task completion evaluation
      if ((decision.tool === ToolType.CHARACTER || decision.tool === ToolType.WORLDBOOK) && result.success) {
        console.log(`✅ ${decision.tool} execution completed with generated content`);
        
        // Update generation output with new data
        if (decision.tool === ToolType.CHARACTER && result.result?.character_data) {
          console.log("🔄 Updating generation output with character data");
          await ResearchSessionOperations.updateGenerationOutput(this.conversationId, {
            character_data: result.result.character_data,
          });
        }
        
        if (decision.tool === ToolType.WORLDBOOK && result.result?.worldbook_data) {
          console.log("🔄 Updating generation output with worldbook data");
          await ResearchSessionOperations.updateGenerationOutput(this.conversationId, {
            worldbook_data: result.result.worldbook_data,
          });
        }
        
        // Check if current task has been completed using LLM analysis
        await this.evaluateTaskCompletion(context);
      }

      // Handle REFLECT tool - update research state and log results
      if (decision.tool === ToolType.REFLECT && result.success) {
        console.log("🔄 Reflection completed");
        
        // Update research state with new task queue from reflection
        if (result.result.updated_task_queue) {
          await ResearchSessionOperations.updateResearchState(this.conversationId, {
            task_queue: result.result.updated_task_queue,
          });
        }
        
        if (result.result.added_count > 0) {
          console.log(`📋 Added ${result.result.added_count} new tasks`);
        }
        
        if (result.result.decomposed_count > 0) {
          console.log(`🔄 Decomposed ${result.result.decomposed_count} complex tasks`);
        }
      }


      // Check if task queue is empty at the end of each iteration
      const currentContext = await this.buildExecutionContext();
      if (!currentContext.research_state.task_queue || currentContext.research_state.task_queue.length === 0) {
        console.log("📋 Task queue is empty, checking final generation completion...");
        const session = await ResearchSessionOperations.getSessionById(this.conversationId);
        if (session?.generation_output) {
          const isComplete = await this.evaluateGenerationProgress(session.generation_output);
          if (isComplete) {
            console.log("✅ Final generation evaluation: Complete");
            await ResearchSessionOperations.updateStatus(this.conversationId, SessionStatus.COMPLETED);
            return {
              success: true,
              result: await this.generateFinalResult(),
            };
          } else {
            console.log("❓ Final generation evaluation: Incomplete, adding completion task");
            // Add basic completion task if needed
            await ResearchSessionOperations.updateResearchState(this.conversationId, {
              task_queue: [{
                id: `completion_task_${Date.now()}`,
                description: "Complete and finalize character and worldbook generation",
                reasoning: "Added for final completion"
              }]
            });
          }
        }
      }

      // Small delay to prevent tight loops
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // If we exit the loop due to limits, return failure
    return {
      success: false,
      error: usedTokens >= tokenBudget ? "Token budget exceeded" : "Maximum iterations reached without completion",
    };
  }

  /**
   * Core planning module - real-time decision making with complete content generation
   * Following DeepResearch: planner generates ALL content, tools just store/process results
   */
  private async selectNextDecision(context: ExecutionContext): Promise<ToolDecision | null> {
    
    // Get detailed tool information in XML format to inject into the prompt
    const availableTools = ToolRegistry.getDetailedToolsInfo();

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
    <conversation_history>{recent_conversation}</conversation_history>
    <knowledge_base>{knowledge_base}</knowledge_base>
    <user_requirements>{user_requirements}</user_requirements>
  </current_state>

  <instructions>
    1.  Carefully analyze the <current_state> and the <tools_schema>.
    2.  Determine the single most critical action to perform next to progress towards the <main_objective>.
    3.  Construct your response meticulously following the <output_specification>.
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

          recent_conversation: this.buildRecentConversationSummary(context.message_history),
          knowledge_base: this.buildKnowledgeBaseSummary(context.research_state.knowledge_base),
          user_requirements: this.buildUserInteractionsSummary(context.research_state.user_interactions),
        }),
      ]);

      const content = response.content as string;
      
      // Parse XML response directly
      const think = content.match(/<think>([\s\S]*?)<\/think>/)?.[1].trim() ?? 'No reasoning provided';
      const action = content.match(/<action>([\s\S]*?)<\/action>/)?.[1].trim() ?? 'null';
      
      if (action === "null" || !action) {
        return null;
      }

      // Parse parameters
      const paramsMatch = content.match(/<parameters>([\s\S]*?)<\/parameters>/);
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
              parameters[key] = JSON.parse(cdataMatch[1]);
            } catch (e) {
              parameters[key] = cdataMatch[1];
            }
          } else {
            parameters[key] = value;
          }
        }
      }

      return {
        tool: action as ToolType,
        parameters: parameters,
        reasoning: think,
        priority: 5,
      };
    } catch (error) {
      console.error("Error in selectNextDecision:", error);
      return null;
    }
  }



  /**
   * Analyze tool failure using LLM and record the analysis
   */
  private async analyzeToolFailure(
    decision: ToolDecision, 
    result: ExecutionResult, 
    context: ExecutionContext
  ): Promise<void> {
    try {
      // Get tool information to understand expected parameters
      const toolInfo = ToolRegistry.getDetailedToolsInfo();
      
      const prompt = ChatPromptTemplate.fromTemplate(`
You are analyzing a tool execution failure to understand what went wrong and provide actionable insights.

FAILED TOOL: {tool_name}
EXPECTED PARAMETERS: {expected_parameters}
ACTUAL PARAMETERS PROVIDED: {actual_parameters}
ERROR MESSAGE: {error_message}
TOOL REASONING: {tool_reasoning}

RECENT MESSAGE HISTORY:
{message_history}

CURRENT CONTEXT:
- Current Task: {current_task}
- Main Objective: {main_objective}

ANALYSIS INSTRUCTIONS:
1. Identify the root cause of the failure (parameter mismatch, missing data, logic error, etc.)
2. Explain why the LLM planner provided incorrect parameters
3. Suggest what should have been provided instead
4. Recommend how to prevent similar failures in the future

Provide your analysis in the following XML format:
<failure_analysis>
  <root_cause>Brief description of what caused the failure</root_cause>
  <parameter_analysis>Analysis of parameter issues - what was expected vs what was provided</parameter_analysis>
  <planner_issue>Why the LLM planner made this mistake</planner_issue>
  <correct_approach>What should have been done instead</correct_approach>
  <prevention>How to prevent similar failures</prevention>
  <impact>Impact on the current session and task progress</impact>
</failure_analysis>
      `);

      const response = await this.model.invoke([
        await prompt.format({
          tool_name: decision.tool,
          expected_parameters: this.extractToolParameters(toolInfo, decision.tool),
          actual_parameters: JSON.stringify(decision.parameters, null, 2),
          error_message: result.error || "Unknown error",
          tool_reasoning: decision.reasoning || "No reasoning provided",
          message_history: this.buildRecentConversationSummary(context.message_history.slice(-5)),
          current_task: context.research_state.task_queue?.[0]?.description || "No current task",
          main_objective: context.research_state.main_objective
        }),
      ]);

      const content = response.content as string;
      
      // Parse the analysis
      const rootCause = content.match(/<root_cause>([\s\S]*?)<\/root_cause>/)?.[1]?.trim() || 'Analysis failed';
      const parameterAnalysis = content.match(/<parameter_analysis>([\s\S]*?)<\/parameter_analysis>/)?.[1]?.trim() || '';
      const plannerIssue = content.match(/<planner_issue>([\s\S]*?)<\/planner_issue>/)?.[1]?.trim() || '';
      const correctApproach = content.match(/<correct_approach>([\s\S]*?)<\/correct_approach>/)?.[1]?.trim() || '';
      const prevention = content.match(/<prevention>([\s\S]*?)<\/prevention>/)?.[1]?.trim() || '';
      const impact = content.match(/<impact>([\s\S]*?)<\/impact>/)?.[1]?.trim() || '';

      // Create comprehensive failure analysis message
      const analysisContent = `TOOL FAILURE ANALYSIS - ${decision.tool}

Root Cause: ${rootCause}

Parameter Analysis: ${parameterAnalysis}

Planner Issue: ${plannerIssue}

Correct Approach: ${correctApproach}

Prevention: ${prevention}

Impact: ${impact}

Technical Details:
- Expected Parameters: ${this.extractToolParameters(toolInfo, decision.tool)}
- Actual Parameters: ${JSON.stringify(decision.parameters, null, 2)}
- Error: ${result.error}`;

      // Record the failure analysis
      await ResearchSessionOperations.addMessage(this.conversationId, {
        role: "agent",
        content: analysisContent,
        type: "tool_failure",
        metadata: {
          tool_used: decision.tool,
          reasoning: decision.reasoning,
        },
      });

      console.log(`🔍 Tool failure analysis completed for ${decision.tool}`);

    } catch (error) {
      console.error("❌ Failed to analyze tool failure:", error);
      
      // Fallback: Simple error recording
      await ResearchSessionOperations.addMessage(this.conversationId, {
        role: "agent",
        content: `Tool execution failed: ${decision.tool} - ${result.error}. Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        type: "tool_failure",
        metadata: {
          tool_used: decision.tool,
          reasoning: decision.reasoning,
        },
      });
    }
  }

  /**
   * Extract tool parameter definitions for a specific tool
   */
  private extractToolParameters(toolsXml: string, toolType: ToolType): string {
    try {
      // Parse the XML to find the specific tool's parameters
      const toolRegex = new RegExp(`<tool>\\s*<type>${toolType}</type>[\\s\\S]*?<parameters>([\\s\\S]*?)</parameters>[\\s\\S]*?</tool>`);
      const match = toolsXml.match(toolRegex);
      
      if (match && match[1]) {
        return match[1].trim();
      }
      
      return `Parameters not found for tool ${toolType}`;
    } catch (error) {
      return `Error extracting parameters for ${toolType}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Build task queue summary for decision making
   */
  private buildTaskQueueSummary(context: ExecutionContext): string {
    const queue = context.research_state.task_queue || [];
    const completed = context.research_state.completed_tasks || [];
    
    if (queue.length === 0) {
      return `No tasks in queue. Completed tasks: ${completed.length}`;
    }
    
    const summary = [`Pending Tasks: ${queue.length}`];
    
    if (queue.length > 0) {
      summary.push(`Current Task: ${queue[0].description}`);
    }
    
    if (queue.length > 1) {
      const nextTasks = queue.slice(1, 4).map(t => t.description);
      summary.push(`Next Tasks: ${nextTasks.join(", ")}${queue.length > 4 ? "..." : ""}`);
    }
    
    if (completed.length > 0) {
      const recentCompleted = completed.slice(-2);
      summary.push(`Recently Completed: ${recentCompleted.join(", ")}`);
    }
    
    return summary.join("\n");
  }

  /**
   * Evaluate if current task has been completed using LLM analysis
   */
  private async evaluateTaskCompletion(context: ExecutionContext): Promise<void> {
    if (!context.research_state.task_queue || context.research_state.task_queue.length === 0) {
      return; // No tasks to evaluate
    }

    const currentTask = context.research_state.task_queue[0]; // First task in queue
    const session = await ResearchSessionOperations.getSessionById(this.conversationId);
    
    if (!session) return;

    const prompt = ChatPromptTemplate.fromTemplate(`
You are evaluating whether a specific task has been completed based on the current generation output.

TASK TO EVALUATE: {task_description}

CURRENT GENERATION OUTPUT:
Character Data: {character_data}
Worldbook Data: {worldbook_data}

INSTRUCTIONS:
Analyze whether the specified task has been sufficiently completed based on the current generation output.
Consider the task description and determine if the current output satisfies the task requirements.

Respond in XML format:
<evaluation>
  <completed>true/false</completed>
  <reasoning>Detailed explanation of why the task is or isn't complete</reasoning>
</evaluation>
    `);

    try {
      const response = await this.model.invoke([
        await prompt.format({
          task_description: currentTask.description,
          character_data: JSON.stringify(session.generation_output.character_data || {}, null, 2),
          worldbook_data: JSON.stringify(session.generation_output.worldbook_data || [], null, 2)
        }),
      ]);

      const content = response.content as string;
      const completedMatch = content.match(/<completed>(.*?)<\/completed>/);
      const reasoningMatch = content.match(/<reasoning>(.*?)<\/reasoning>/s);
      
      const isCompleted = completedMatch?.[1]?.trim().toLowerCase() === 'true';
      const reasoning = reasoningMatch?.[1]?.trim() || 'No reasoning provided';

      if (isCompleted) {
        console.log(`✅ Task completed: ${currentTask.description}`);
        console.log(`📝 Reasoning: ${reasoning}`);
        
        // Move task from queue to completed_tasks
        const updatedQueue = context.research_state.task_queue.slice(1); // Remove first task
        const updatedCompleted = [...context.research_state.completed_tasks, currentTask.description];
        
        await ResearchSessionOperations.updateResearchState(this.conversationId, {
          task_queue: updatedQueue,
          completed_tasks: updatedCompleted
        });

        await ResearchSessionOperations.addMessage(this.conversationId, {
          role: "agent",
          content: `Task completed: ${currentTask.description}. ${reasoning}`,
          type: "agent_thinking",
          metadata: {
            task_completed: currentTask.description,
            reasoning: reasoning
          },
        });
      } else {
        console.log(`⏳ Task still in progress: ${currentTask.description}`);
        console.log(`📝 Reasoning: ${reasoning}`);
      }

    } catch (error) {
      console.error("❌ Error evaluating task completion:", error);
    }
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
   * Evaluate generation progress - assess if GenerationOutput meets completion standards
   */
  private async evaluateGenerationProgress(generationOutput: GenerationOutput): Promise<boolean> {
    // First, perform basic validation checks
    const basicValidation = this.performBasicValidation(generationOutput);
    if (!basicValidation.isValid) {

      await ResearchSessionOperations.addMessage(this.conversationId, {
        role: "agent",
        content: `Basic validation failed: ${basicValidation.reason}`,
        type: "quality_evaluation",
      });

      console.log(`❌ Basic validation failed: ${basicValidation.reason}`);
      return false;
    }

    console.log("✅ Basic validation passed, proceeding with LLM quality assessment");

    // If basic validation passes, use LLM for quality assessment
    const prompt = ChatPromptTemplate.fromTemplate(`
<prompt>
  <system_role>
    You are an expert quality assurance agent for character and worldbook generation. Your task is to evaluate the GenerationOutput and determine if it meets high-quality standards for completion.
  </system_role>

  <evaluation_context>
    <generation_output>
      <![CDATA[{generation_output}]]>
    </generation_output>
  </evaluation_context>

  <evaluation_criteria>
    <character_data_criteria>
      - All required fields must be complete and non-empty
      - Character personality should be distinctive, engaging, and well-developed
      - Scenario should be compelling and provide clear context
      - First message should be engaging and in-character
      - Example messages should demonstrate consistent personality and writing style
      - Creator notes should provide useful guidance
    </character_data_criteria>
    
    <worldbook_criteria>
      - Must have at least 5 high-quality entries
      - For world-building stories, must include: character relationships, world information, world rules
      - Each entry should have appropriate keywords for discovery
      - Content should be detailed, useful, and consistent
      - Entries should complement the character and enhance the storytelling experience
    </worldbook_criteria>
    
    <overall_quality_standards>
      - Content should be engaging, creative, and well-written
      - All elements should work together cohesively
      - Quality should meet professional standards for character AI applications
    </overall_quality_standards>
  </evaluation_criteria>

  <instructions>
    Evaluate the GenerationOutput strictly based on the criteria above. Focus on content quality, completeness, and overall excellence. Be thorough but demanding in your assessment.
  </instructions>

  <output_specification>
    You MUST respond using the following XML format. Do not include any other text outside this block.

    <evaluation_response>
      <reasoning>Detailed explanation of your assessment, covering character data quality, worldbook quality, and overall cohesion.</reasoning>
      <character_quality_score>Character data quality score from 0 to 100.</character_quality_score>
      <worldbook_quality_score>Worldbook data quality score from 0 to 100.</worldbook_quality_score>
      <overall_quality_score>Overall quality score from 0 to 100.</overall_quality_score>
      <is_sufficient>true or false, based on whether the generation meets high-quality completion standards (overall_quality_score >= 85).</is_sufficient>
      <improvement_suggestions>
        <suggestion>Specific improvement suggestion 1, if needed.</suggestion>
        <suggestion>Specific improvement suggestion 2, if needed.</suggestion>
      </improvement_suggestions>
    </evaluation_response>
  </output_specification>
</prompt>`);

    const context = await this.buildExecutionContext();
    const llm = this.createLLM(context.llm_config);
    const chain = prompt.pipe(llm).pipe(new StringOutputParser());

    try {
      const response = await chain.invoke({
        generation_output: JSON.stringify(generationOutput, null, 2)
      });

      // Parse XML response directly
      const reasoning = response.match(/<reasoning>([\s\S]*?)<\/reasoning>/)?.[1].trim() ?? 'No reasoning provided';
      const character_quality_score = parseInt(response.match(/<character_quality_score>(\d+)<\/character_quality_score>/)?.[1] ?? '0', 10);
      const worldbook_quality_score = parseInt(response.match(/<worldbook_quality_score>(\d+)<\/worldbook_quality_score>/)?.[1] ?? '0', 10);
      const overall_quality_score = parseInt(response.match(/<overall_quality_score>(\d+)<\/overall_quality_score>/)?.[1] ?? '0', 10);
      const is_sufficient = response.match(/<is_sufficient>(true|false)<\/is_sufficient>/)?.[1] === 'true';

      const improvement_suggestions: string[] = [];
      const suggestionsMatch = response.match(/<improvement_suggestions>([\s\S]*?)<\/improvement_suggestions>/)?.[1] ?? '';
      const suggestionRegex = /<suggestion>([\s\S]*?)<\/suggestion>/g;
      let match;
      while ((match = suggestionRegex.exec(suggestionsMatch)) !== null) {
          improvement_suggestions.push(match[1].trim());
      }

      const evaluation = { reasoning, character_quality_score, worldbook_quality_score, overall_quality_score, is_sufficient, improvement_suggestions };
      
      // Update completion status based on evaluation
      await this.updateCompletionStatus({
        answer_confidence: evaluation.overall_quality_score,
        information_quality: evaluation.worldbook_quality_score,
        user_satisfaction: evaluation.character_quality_score,
      });

      await ResearchSessionOperations.addMessage(this.conversationId, {
        role: "agent",
        content: `Quality evaluation: ${JSON.stringify(evaluation)}`,
        type: "quality_evaluation",
      }); 

      console.log(`📊 Quality Assessment - Character: ${evaluation.character_quality_score}%, Worldbook: ${evaluation.worldbook_quality_score}%, Overall: ${evaluation.overall_quality_score}%`);
      
      return evaluation.is_sufficient;

    } catch (error) {
      console.error("❌ Generation evaluation failed:", error);
      return false;
    }
  }

  /**
   * Perform basic validation of GenerationOutput before LLM assessment
   */
  private performBasicValidation(generationOutput: GenerationOutput): { isValid: boolean; reason?: string } {
    // Check if character_data exists and all required fields are non-empty
    if (!generationOutput.character_data) {
      return { isValid: false, reason: "character_data is missing" };
    }

    const charData = generationOutput.character_data;
    const requiredCharFields = ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes'];
    
    for (const field of requiredCharFields) {
      if (!charData[field] || charData[field].trim() === '') {
        return { isValid: false, reason: `character_data.${field} is empty or missing` };
      }
    }

    // Check if worldbook_data exists and has at least 5 entries
    if (!generationOutput.worldbook_data || !Array.isArray(generationOutput.worldbook_data)) {
      return { isValid: false, reason: "worldbook_data is missing or not an array" };
    }

    if (generationOutput.worldbook_data.length < 5) {
      return { isValid: false, reason: `worldbook_data has only ${generationOutput.worldbook_data.length} entries, minimum 5 required` };
    }
    return { isValid: true };
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



  private buildRecentConversationSummary(messages: any[]): string {
    return messages.slice(-5).map(m => `${m.role}: ${m.content}`).join("\n");
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
 
 
