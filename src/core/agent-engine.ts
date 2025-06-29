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
  Message,
} from "../models/agent-model";
import { ResearchSessionOperations } from "../data/agent/agent-conversation-operations";
import { ToolRegistry } from "../tools/tool-registry";
import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

// ============================================================================
// BACKGROUND KNOWLEDGE - CHARACTER CARDS AND WORLDBOOKS
// ============================================================================

/**
 * Core background knowledge about character cards and worldbooks for AI roleplay
 * This information is essential for understanding the generation targets
 */
const CORE_KNOWLEDGE_SECTION = `
## BACKGROUND KNOWLEDGE: CHARACTER CARDS & WORLDBOOKS

### CHARACTER CARDS OVERVIEW
A character card is a structured data format that defines AI roleplay scenarios. Character cards can represent either individual characters or entire world-based scenarios and stories, serving as the foundation for persistent conversations and defining how the AI should behave and interact.

#### Character Card Core Fields:
- **name**: Primary identifier - can be a character name or scenario title
- **description**: Physical/visual details for characters, or world setting description for scenarios
- **personality**: Behavioral traits for characters, or narrative style/tone for world scenarios
- **scenario**: Context and circumstances - character's situation or world's current state/events
- **first_mes**: Opening message that establishes the roleplay situation
- **mes_example**: Example dialogue demonstrating the expected interaction style and format
- **creator_notes**: Usage guidelines, compatibility information, and creator insights
- **avatar**: Visual representation - character portrait or scenario artwork
- **alternate_greetings**: Multiple opening scenarios or character introduction variations
- **tags**: Categorization for discovery - genre, themes, character types, world elements

#### Character Card Types & Applications:
1. **Individual Characters**: Focused on a specific person with defined personality, background, and traits
2. **World Scenarios**: Broader settings featuring multiple characters, locations, and ongoing storylines
3. **Hybrid Approaches**: Character-centric cards that include rich world elements and supporting cast

#### Character Card Design Principles:
1. **Clear Identity**: Whether character or world-focused, establish a distinctive identity and voice
2. **Consistency**: Maintain coherent tone, style, and logical consistency throughout all fields
3. **Engaging Content**: Create compelling scenarios that invite meaningful interaction and exploration
4. **Contextual Clarity**: Provide sufficient background for users to understand and engage with the scenario
5. **Professional Quality**: Meet standards for AI roleplay applications with polished, well-crafted content

### WORLDBOOKS (LOREBOOKS) OVERVIEW
Worldbooks are dynamic knowledge systems that provide contextual information to enhance AI roleplay. They function as intelligent databases that inject relevant background information when specific keywords are detected, supporting both character-focused and world-based scenarios.

#### Worldbook Core Concepts:
- **Keyword Activation**: Entries trigger when associated keywords appear in conversation
- **Dynamic Insertion**: Only relevant information is injected based on context, preserving token efficiency
- **Context Enhancement**: Provides background lore, character relationships, world rules, and scenario details
- **Token Efficiency**: Conserves prompt space by loading only needed information at appropriate moments
- **Recursive Activation**: Entries can trigger other entries, creating complex information networks

#### Worldbook Entry Structure:
- **key**: Primary trigger keywords that activate the entry
- **keysecondary**: Secondary keywords for conditional or refined activation logic
- **content**: The actual information inserted into the prompt when triggered
- **comment**: Internal organizational notes for creators and maintainers
- **order**: Priority level determining insertion sequence when multiple entries activate
- **constant**: Controls whether entry remains permanently active regardless of keywords
- **selective**: Enables advanced keyword logic with AND/OR/NOT operations for precise activation

#### Worldbook Best Practices:
1. **Quality over Quantity**: Focus on creating meaningful, well-crafted entries rather than numerous shallow ones
2. **Comprehensive Coverage**: Include character relationships, world information, rules, and contextual details
3. **Strategic Keywords**: Use discoverable, relevant keywords that naturally appear in conversations
4. **Content Depth**: Provide useful, detailed information that genuinely enhances storytelling and immersion
5. **Scenario Integration**: Ensure entries complement and enhance the character card's scenario and tone
6. **Token Management**: Balance information richness with efficient token usage for optimal performance

### INTEGRATION PRINCIPLES
Character cards and worldbooks work together to create rich, immersive roleplay experiences across different scenario types:
- **Scenario Foundation**: Character cards establish the core identity, tone, and context
- **Dynamic Enhancement**: Worldbooks provide adaptive background information that enriches interactions
- **Contextual Flow**: Worldbook entries activate naturally based on conversation direction and topics
- **Narrative Coherence**: All elements work together to maintain consistent storytelling and world logic
- **User Experience**: The combination should feel seamless and enhance rather than complicate interactions
- **Flexible Application**: System supports both character-focused and world-building approaches effectively

This knowledge is fundamental to creating professional-quality AI roleplay content that meets industry standards for engagement, consistency, technical excellence, and supports diverse storytelling approaches.
`;

/**
 * Creates a standardized prompt template with core background knowledge
 * This should be used for all major LLM calls in the system
 */
function createStandardPromptTemplate(specificPrompt: string): ChatPromptTemplate {
  const fullPrompt = `${CORE_KNOWLEDGE_SECTION}

${specificPrompt}`;
  
  return ChatPromptTemplate.fromTemplate(fullPrompt);
}

// ============================================================================
// AGENT ENGINE
// ============================================================================

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

    const prompt = createStandardPromptTemplate(`
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
      };

      await ResearchSessionOperations.updateResearchState(this.conversationId, stateUpdate);
      
      console.log(`✅ Task decomposition complete: ${taskQueue.length} tasks created`);

      // Add initialization message
      await ResearchSessionOperations.addMessage(this.conversationId, {
        role: "agent",
        content: `Task decomposition complete: ${taskQueue.length} initial tasks identified. ${decompositionReasoning}`,
        type: "agent_thinking",
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
        // Add knowledge entries from search results
        if (result.result?.knowledge_entries && result.result.knowledge_entries.length > 0) {
          await ResearchSessionOperations.addKnowledgeEntries(this.conversationId, result.result.knowledge_entries);
          console.log(`📊 Knowledge base updated: added ${result.result.knowledge_entries.length} new entries`);
        }
        
        continue;
      }

      // Handle ASK_USER tool - special case for user interaction flow control
      if (decision.tool === ToolType.ASK_USER && result.success) {
        if (!this.userInputCallback) {
          throw new Error("User input required but no callback provided");
        }

        await ResearchSessionOperations.updateStatus(this.conversationId, SessionStatus.WAITING_USER);
        
        const userInput = await this.userInputCallback(result.result?.message);

        await ResearchSessionOperations.addMessage(this.conversationId, {
          role: "agent",
          content: result.result?.message,
          type: "agent_action",
        });
        
        await ResearchSessionOperations.addMessage(this.conversationId, {
          role: "user",
          content: userInput,
          type: "user_input",
        });
        
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

      // Handle REFLECT tool - add new tasks to the current queue
      if (decision.tool === ToolType.REFLECT && result.success) {
        console.log("🔄 Reflection completed");
        
        // Efficiently add new tasks without fetching the entire session
        if (result.result.new_tasks && result.result.new_tasks.length > 0) {
          await ResearchSessionOperations.addTasksToQueue(this.conversationId, result.result.new_tasks);
          console.log(`📋 Added ${result.result.tasks_count} new tasks to queue`);
        }
      }


      // Check if task queue is empty at the end of each iteration
      const currentContext = await this.buildExecutionContext();
      if (!currentContext.research_state.task_queue || currentContext.research_state.task_queue.length === 0) {
        console.log("📋 Task queue is empty, checking final generation completion...");
        const session = await ResearchSessionOperations.getSessionById(this.conversationId);
        if (session?.generation_output) {
          const evaluationResult = await this.evaluateGenerationProgress(session.generation_output);
          if (evaluationResult === null) {
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
    
    const prompt = createStandardPromptTemplate(`
<prompt>
  <system_role>
    You are a master planning agent for a character and world-building assistant.
    Your primary goal is to analyze the user's request, the current state of the project, and the available tools to decide the single best next action.
    You must think step-by-step and provide your reasoning, your chosen action, and the complete parameters for that action in the specified XML format.
  </system_role>

  <tools_schema>
    {available_tools}
  </tools_schema>

  <main_objective>
    {main_objective}
  </main_objective>

  <completed_tasks>
    {completed_tasks}
  </completed_tasks>

  <existing_knowledge>
    {knowledge_base}
  </existing_knowledge>

  <conversation_context>
    {recent_conversation}
  </conversation_context>

  <current_task_queue>
    {task_queue_status}
  </current_task_queue>

  <user_requirements>
    {user_requirements}
  </user_requirements>

  <instructions>
    1.  Analyze the <main_objective> and assess current progress based on <completed_tasks>.
    2.  Review <existing_knowledge> to understand what information is already available.
    3.  Consider recent <conversation_context> for additional context and user feedback.
    4.  Examine <current_task_queue> to understand what tasks remain to be completed.
    5.  Reference <user_requirements> for specific user needs and preferences.
    7.  Based on this analysis, determine the single most critical action from <tools_schema> to progress towards the <main_objective>.
    8.  Construct your response meticulously following the <output_specification>.
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
          completed_tasks: this.buildCompletedTasksSummary(context),
          knowledge_base: this.buildKnowledgeBaseSummary(context.research_state.knowledge_base),
          recent_conversation: this.buildRecentConversationSummary(context.message_history),
          task_queue_status: this.buildTaskQueueSummary(context),
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
      
      const prompt = createStandardPromptTemplate(`
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
      });

      console.log(`🔍 Tool failure analysis completed for ${decision.tool}`);

    } catch (error) {
      console.error("❌ Failed to analyze tool failure:", error);
      
      // Fallback: Simple error recording
      await ResearchSessionOperations.addMessage(this.conversationId, {
        role: "agent",
        content: `Tool execution failed: ${decision.tool} - ${result.error}. Analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        type: "tool_failure",
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
    if (!context.research_state.task_queue || context.research_state.task_queue.length === 0) {
      return "No pending tasks in queue";
    }

    const currentTask = context.research_state.task_queue[0];
    const remainingCount = context.research_state.task_queue.length - 1;

    let summary = `Current Task: ${currentTask.description}`;
    if (currentTask.reasoning) {
      summary += ` (${currentTask.reasoning})`;
    }

    if (remainingCount > 0) {
      summary += `\nRemaining Tasks: ${remainingCount} tasks in queue`;
      // Show next 2 upcoming tasks for context
      const upcomingTasks = context.research_state.task_queue.slice(1, 3);
      upcomingTasks.forEach((task, index) => {
        summary += `\n${index + 2}. ${task.description}`;
      });
    }

    return summary;
  }

  private buildCompletedTasksSummary(context: ExecutionContext): string {
    if (!context.research_state.completed_tasks || context.research_state.completed_tasks.length === 0) {
      return "No tasks completed yet";
    }

    const completedTasks = context.research_state.completed_tasks;
    let summary = `Total Completed: ${completedTasks.length} tasks\n\n`;
    
    // Show the most recent completed tasks (up to 5)
    const recentCompleted = completedTasks.slice(-5);
    summary += "Recently Completed Tasks:\n";
    recentCompleted.forEach((task, index) => {
      summary += `${recentCompleted.length - index}. ${task}\n`;
    });

    return summary.trim();
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

    const prompt = createStandardPromptTemplate(`
You are evaluating whether a specific task has been completed based on the current generation output.

TASK TO EVALUATE: {task_description}

CURRENT GENERATION OUTPUT:
Character Data: {character_data}
Worldbook Data: {worldbook_data}

INSTRUCTIONS:
1. TASK COMPLETION EVALUATION:
   Analyze whether the specified task has been sufficiently completed based on the current generation output.
   Consider the task description and determine if the current output satisfies the task requirements.
   Focus ONLY on whether this specific task is done, not on overall quality.

2. GLOBAL OUTPUT EVALUATION (SEPARATE FROM TASK COMPLETION):
   Additionally, provide global evaluation scores for the overall generation output:
   
   - answer_confidence (0-100): How confident we are in the current generation's ability to fulfill the user's original request
     * 0-30: Very poor, major elements missing or incorrect
     * 31-50: Below average, significant improvements needed
     * 51-70: Average quality, some areas need work
     * 71-85: Good quality, minor refinements needed
     * 86-100: Excellent quality, meets or exceeds expectations
   
   - information_quality (0-100): Quality and completeness of the generated content (character + worldbook)
     * 0-30: Very low quality, incomplete or inconsistent content
     * 31-50: Below average, lacks depth or has issues
     * 51-70: Average quality, adequate but could be improved
     * 71-85: Good quality, well-developed and consistent
     * 86-100: Excellent quality, rich, detailed, and highly coherent

IMPORTANT: The answer_confidence and information_quality scores are GLOBAL EVALUATIONS of the entire generation output and DO NOT influence whether the current task is considered complete. Task completion is determined solely by whether the specific task requirements have been met.

Respond in XML format:
<evaluation>
  <completed>true/false</completed>
  <reasoning>Detailed explanation of why the current task is or isn't complete based on task requirements</reasoning>
  <answer_confidence>Confidence score 0-100 in the overall generation's ability to fulfill user request</answer_confidence>
  <information_quality>Quality score 0-100 of the overall generated content (character + worldbook)</information_quality>
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
      const confidenceMatch = content.match(/<answer_confidence>(\d+)<\/answer_confidence>/);
      const qualityMatch = content.match(/<information_quality>(\d+)<\/information_quality>/);
      
      const isCompleted = completedMatch?.[1]?.trim().toLowerCase() === 'true';
      const reasoning = reasoningMatch?.[1]?.trim() || 'No reasoning provided';
      const answerConfidence = parseInt(confidenceMatch?.[1] || '0', 10);
      const informationQuality = parseInt(qualityMatch?.[1] || '0', 10);

      // Update progress data based on task evaluation
      await this.updateCompletionStatus({
        answer_confidence: answerConfidence,
        information_quality: informationQuality,
      });

      if (isCompleted) {
        console.log(`✅ Task completed: ${currentTask.description}`);
        console.log(`📝 Reasoning: ${reasoning}`);
        
        // Complete the current task and move it to completed tasks
        await ResearchSessionOperations.completeCurrentTask(this.conversationId);

        await ResearchSessionOperations.addMessage(this.conversationId, {
          role: "agent",
          content: `Task completed: ${currentTask.description}. ${reasoning}`,
          type: "agent_thinking",
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
   * Returns null if satisfied, or improvement suggestions string if not satisfied
   */
  private async evaluateGenerationProgress(generationOutput: GenerationOutput): Promise<string | null> {
    // First, perform basic validation checks
    const basicValidation = this.performBasicValidation(generationOutput);
    if (!basicValidation.isValid) {
      const improvementMsg = `Basic validation failed: ${basicValidation.reason}`;

      await ResearchSessionOperations.addMessage(this.conversationId, {
        role: "agent",
        content: improvementMsg,
        type: "quality_evaluation",
      });

      console.log(`❌ Basic validation failed: ${basicValidation.reason}`);
      return improvementMsg;
    }

    console.log("✅ Basic validation passed, proceeding with LLM quality assessment");

    // If basic validation passes, use LLM for quality assessment
    const prompt = createStandardPromptTemplate(`
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

      console.log(`📊 Quality Assessment - Character: ${character_quality_score}%, Worldbook: ${worldbook_quality_score}%, Overall: ${overall_quality_score}%`);
      
      if (is_sufficient) {
        // Generation meets completion standards
        return null;
      } else {
        // Generation needs improvement - return suggestions
        const improvementMsg = `Quality assessment indicates improvements needed (Overall: ${overall_quality_score}%):\n${reasoning}\n\nSpecific suggestions:\n${improvement_suggestions.map(s => `- ${s}`).join('\n')}`;

      await ResearchSessionOperations.addMessage(this.conversationId, {
        role: "agent",
          content: improvementMsg,
        type: "quality_evaluation",
      }); 

        return improvementMsg;
      }

    } catch (error) {
      console.error("❌ Generation evaluation failed:", error);
      const errorMsg = `Generation evaluation failed: ${error instanceof Error ? error.message : String(error)}`;
      
      await ResearchSessionOperations.addMessage(this.conversationId, {
        role: "agent",
        content: errorMsg,
        type: "quality_evaluation",
      });

      return errorMsg;
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



  private buildRecentConversationSummary(messages: Message[]): string {
    return messages.slice(-5).map(m => `${m.type}: ${m.content}`).join("\n");
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
    // Update progress status
    await ResearchSessionOperations.updateProgressStatus(this.conversationId, updates);
  }

  private async generateFinalResult(): Promise<any> {
    // For final result generation, we do need the complete session data
    // This is acceptable since it only happens once at the very end
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
 
 
