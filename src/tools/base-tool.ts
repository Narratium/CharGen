import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/ollama";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { 
  ToolType,
  ToolExecutionContext,
  ToolExecutionResult,
  PlanTask,
  AgentConversation,
} from "../models/agent-model";
import { ThoughtBufferOperations } from "../data/agent/thought-buffer-operations";
import { AgentConversationOperations } from "../data/agent/agent-conversation-operations";

/**
 * Base Tool Class - provides common functionality for all tools
 */
export abstract class BaseTool {
  abstract readonly toolType: ToolType;
  abstract readonly name: string;
  abstract readonly description: string;

  /**
   * Check if this tool can execute the given task
   */
  canExecute(task: PlanTask): boolean {
    return task.tool === this.toolType;
  }

  /**
   * Execute the tool with the given task and context (with automatic logging and error handling)
   */
  async executeTask(task: PlanTask, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    // Automatic start logging
    this.logTaskExecution('start', task);
    
    // Automatic thought logging
    await this.addThought(
      context.conversation_id,
      "reasoning",
      `Executing ${this.name}: ${task.description}`,
      task.id,
    );

    try {
      // Call the actual tool implementation
      const result = await this.executeToolLogic(task, context);
      
      // Automatic success logging
      this.logTaskExecution('success', task, { 
        success: result.success,
        hasResult: !!result.result,
        userInputRequired: result.user_input_required
      });
      
      return result;
      
    } catch (error) {
      // Automatic error handling and logging
      this.logTaskExecution('error', task, error);
      
      // Add error reflection thought
      await this.addThought(
        context.conversation_id,
        "reflection",
        `${this.name} execution failed: ${error instanceof Error ? error.message : String(error)}`,
        task.id,
      ).catch(err => console.error("Failed to add error thought:", err));
      
      return this.handleToolError(error, context, task.id, `${this.name} execution failed`);
    }
  }

  /**
   * Abstract method that each tool must implement - contains the actual tool logic
   */
  abstract executeToolLogic(task: PlanTask, context: ToolExecutionContext): Promise<ToolExecutionResult>;

  /**
   * Get tool information for LLM prompt
   */
  getToolInfo(): { type: string; name: string; description: string } {
    return {
      type: this.toolType,
      name: this.name,
      description: this.description,
    };
  }

  /**
   * Create LLM instance from config
   */
  protected createLLM(config: AgentConversation["llm_config"]) {
    console.log(`🔧 [Base Tool] Config: ${JSON.stringify({
      type: config.llm_type,
      model: config.model_name,
      baseUrl: config.base_url,
      hasApiKey: !!config.api_key,
      temperature: config.temperature,
      maxTokens: config.max_tokens
    })}`);

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
   * Add thought to conversation
   */
  protected async addThought(
    conversationId: string,
    type: "observation" | "reasoning" | "decision" | "reflection",
    content: string,
    taskId?: string,
  ): Promise<void> {
    await ThoughtBufferOperations.addThought(conversationId, {
      type,
      content,
      related_task_id: taskId,
    });
  }

  /**
   * Add message to conversation
   */
  protected async addMessage(
    conversationId: string,
    role: "agent" | "system",
    content: string,
    messageType: "agent_thinking" | "agent_action" | "agent_output" | "system_info" = "agent_output",
  ): Promise<void> {
    await AgentConversationOperations.addMessage(conversationId, {
      role,
      content,
      message_type: messageType,
    });
  }

  /**
   * Build core context for LLM prompts - includes all essential information
   */
  protected async buildCoreContext(task: PlanTask, context: ToolExecutionContext): Promise<string> {
    const { plan_pool, thought_buffer, current_result } = context;
    
    // 1. Current Results Status
    const resultStatus = this.buildResultStatus(current_result);
    
    // 2. Current Task Information
    const taskInfo = this.buildTaskInfo(task, plan_pool);
    
    // 3. Context (Conversations + Execution Information) - NOW ASYNC AND COMPREHENSIVE
    const conversationContext = await this.buildConversationContext(context);
    
    // 4. Recent Failures with Task Attribution
    const failureContext = this.buildFailureContext(plan_pool.context.failure_history, plan_pool.completed_tasks);

    return `
=== CORE CONTEXT FOR CHARACTER & WORLDBOOK GENERATION ===

${resultStatus}

${taskInfo}

${conversationContext}

${failureContext}

=== END CORE CONTEXT ===
`.trim();
  }

  /**
   * Build current results status section
   */
  private buildResultStatus(result: any): string {
    const hasCharacter = !!result.character_data;
    const hasWorldbook = !!result.worldbook_data && result.worldbook_data.length > 0;
    
    let status = "📊 CURRENT GENERATION STATUS:\n";
    
    if (hasCharacter) {
      status += `✅ Character Card: COMPLETE\n`;
      status += `   Name: ${result.character_data.name || 'N/A'}\n`;
      status += `   Description: ${(result.character_data.description || '').substring(0, 100)}${result.character_data.description?.length > 100 ? '...' : ''}\n`;
      status += `   Personality: ${(result.character_data.personality || '').substring(0, 100)}${result.character_data.personality?.length > 100 ? '...' : ''}\n`;
    } else {
      status += `❌ Character Card: NOT GENERATED\n`;
    }
    
    if (hasWorldbook) {
      status += `✅ Worldbook: COMPLETE (${result.worldbook_data.length} entries)\n`;
      const recentEntries = result.worldbook_data.slice(0, 3);
      for (const entry of recentEntries) {
        status += `   - ${entry.comment}: ${(entry.content || '').substring(0, 60)}${entry.content?.length > 60 ? '...' : ''}\n`;
      }
      if (result.worldbook_data.length > 3) {
        status += `   ... and ${result.worldbook_data.length - 3} more entries\n`;
      }
    } else {
      status += `❌ Worldbook: NOT GENERATED\n`;
    }

    return status;
  }

  /**
   * Build current task information section
   */
  private buildTaskInfo(task: PlanTask, planPool: any): string {
    const pendingTasks = planPool.current_tasks.filter((t: any) => t.status === 'pending');
    const completedTasks = planPool.completed_tasks.slice(-5); // Last 5 completed
    
    let info = "🎯 CURRENT TASK & PLAN STATUS:\n";
    info += `Current Task: "${task.description}" (Tool: ${task.tool})\n`;
    info += `Task Priority: ${task.priority}/10\n`;
    info += `Task Reasoning: ${task.reasoning || 'Not specified'}\n\n`;
    
    info += `Plan Focus: ${planPool.context.current_focus}\n`;
    info += `Pending Tasks: ${pendingTasks.length}\n`;
    info += `Completed Tasks: ${planPool.completed_tasks.length}\n\n`;
    
    if (pendingTasks.length > 0) {
      info += "Next Pending Tasks:\n";
      for (const t of pendingTasks.slice(0, 3)) {
        info += `  - "${t.description}" (${t.tool}, Priority: ${t.priority})\n`;
      }
    }
    
    if (completedTasks.length > 0) {
      info += "\nRecently Completed:\n";
      for (const t of completedTasks) {
        info += `  - "${t.description}" (${t.tool}) - ${t.status}\n`;
      }
    }

    return info;
  }

  /**
   * Build conversation context section - core of the context system
   */
  private async buildConversationContext(context: ToolExecutionContext): Promise<string> {
    // Get full conversation to access messages
    const conversation = await AgentConversationOperations.getConversationById(context.conversation_id);
    if (!conversation) {
      return "💭 CONVERSATION CONTEXT: Unable to load conversation history\n";
    }

    let conversationInfo = "💭 CONVERSATION & EXECUTION HISTORY:\n";
    conversationInfo += `Original Request: "${context.plan_pool.context.user_request}"\n\n`;
    
    // Get recent conversation messages (last 15 messages for context)
    const recentMessages = conversation.messages.slice(-15);
    
    if (recentMessages.length > 0) {
      conversationInfo += "=== RECENT CONVERSATION FLOW ===\n";
      
      for (const message of recentMessages) {
        const timestamp = new Date(message.timestamp).toLocaleTimeString();
        const icon = this.getMessageIcon(message.message_type);
        
        // Format message based on type
        switch (message.message_type) {
          case "user_input":
            conversationInfo += `${icon} [${timestamp}] USER: "${message.content}"\n`;
            break;
          case "agent_thinking":
            conversationInfo += `${icon} [${timestamp}] AI THINKING: ${this.truncateText(message.content, 100)}\n`;
            break;
          case "agent_action":
            const toolUsed = message.metadata?.tool_used || "Unknown";
            conversationInfo += `${icon} [${timestamp}] AI ACTION: ${message.content} (${toolUsed})\n`;
            break;
          case "agent_output":
            conversationInfo += `${icon} [${timestamp}] AI OUTPUT: ${this.truncateText(message.content, 100)}\n`;
            break;
          case "system_info":
            conversationInfo += `${icon} [${timestamp}] SYSTEM: ${this.truncateText(message.content, 80)}\n`;
            break;
        }
      }
      conversationInfo += "\n";
    }
    
    // Extract key user interactions and preferences
    const userInputs = conversation.messages.filter(m => m.message_type === "user_input");
    if (userInputs.length > 1) { // More than just the initial request
      conversationInfo += "=== KEY USER INTERACTIONS ===\n";
      for (const input of userInputs.slice(-5)) { // Last 5 user inputs
        conversationInfo += `• "${this.truncateText(input.content, 150)}"\n`;
      }
      conversationInfo += "\n";
    }
    
    // Show execution trajectory from completed tasks
    const recentCompletedTasks = context.plan_pool.completed_tasks.slice(-5);
    if (recentCompletedTasks.length > 0) {
      conversationInfo += "=== RECENT EXECUTION TRAJECTORY ===\n";
      for (const task of recentCompletedTasks) {
        const status = task.status === "completed" ? "✅" : "❌";
        conversationInfo += `${status} ${task.tool}: "${this.truncateText(task.description, 80)}" - ${task.status}\n`;
      }
      conversationInfo += "\n";
    }
    
    // Current reasoning and focus
    if (context.thought_buffer.current_reasoning) {
      conversationInfo += `Current AI Reasoning: ${context.thought_buffer.current_reasoning}\n`;
    }
    
    conversationInfo += `Current Focus: ${context.plan_pool.context.current_focus}\n`;

    return conversationInfo;
  }

  /**
   * Get appropriate icon for message type
   */
  private getMessageIcon(messageType: string): string {
    switch (messageType) {
      case "user_input": return "👤";
      case "agent_thinking": return "🤔";
      case "agent_action": return "⚡";
      case "agent_output": return "🤖";
      case "system_info": return "ℹ️";
      default: return "💬";
    }
  }

  /**
   * Truncate text with ellipsis
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + "...";
  }

  /**
   * Build failure context with task attribution
   */
  private buildFailureContext(failureHistory: any, completedTasks: any[]): string {
    if (!failureHistory.recent_failures || failureHistory.recent_failures.length === 0) {
      return "✅ FAILURE STATUS: No recent failures";
    }
    
    let failureInfo = "⚠️  RECENT FAILURES TO AVOID:\n";
    
    // Group failures by tool
    const failuresByTool = failureHistory.recent_failures.reduce((acc: any, failure: any) => {
      if (!acc[failure.tool]) acc[failure.tool] = [];
      acc[failure.tool].push(failure);
      return acc;
    }, {});
    
    for (const [tool, failures] of Object.entries(failuresByTool)) {
      const toolFailures = failures as any[];
      const count = failureHistory.failed_tool_attempts[tool] || 0;
      
      failureInfo += `\n${tool} Tool (${count} total failures):\n`;
      
      for (const failure of toolFailures.slice(-3)) { // Last 3 failures for this tool
        // Find the original task that failed
        const failedTask = completedTasks.find(t => t.completed_at === failure.timestamp);
        const taskContext = failedTask ? ` (Task: "${failedTask.description}")` : '';
        
        failureInfo += `  ❌ Attempt #${failure.attempt_count}: "${failure.description}"${taskContext}\n`;
        failureInfo += `     Error: ${failure.error}\n`;
        failureInfo += `     Time: ${new Date(failure.timestamp).toLocaleString()}\n`;
      }
      
      if (count >= 3) {
        failureInfo += `  🚨 WARNING: This tool has failed ${count} times - consider alternatives!\n`;
      }
    }

         return failureInfo;
   }

  /**
   * Standardized LLM execution with error handling
   */
  protected async executeLLMChain(
    prompt: ChatPromptTemplate,
    inputData: Record<string, any>,
    context: ToolExecutionContext,
    options: {
      parseJson?: boolean;
      fallbackValue?: any;
      errorMessage?: string;
    } = {}
  ): Promise<any> {
    try {
      const llm = this.createLLM(context.llm_config);
      const chain = prompt.pipe(llm).pipe(new StringOutputParser());
      const response = await chain.invoke(inputData);
      
      if (options.parseJson) {
        try {
          const cleanedResponse = this.extractJsonFromResponse(response);
          return JSON.parse(cleanedResponse);
        } catch (parseError) {
          console.error(`JSON parsing failed for response: "${response.substring(0, 500)}..."`);
          console.error(`Cleaned response: "${this.extractJsonFromResponse(response).substring(0, 500)}..."`);
          console.error(`Parse error: ${parseError instanceof Error ? parseError.message : parseError}`);
          throw parseError;
        }
      }
      
      return response;
    } catch (error) {
      console.error(`LLM execution failed: ${error instanceof Error ? error.message : error}`);
      
      if (options.fallbackValue !== undefined) {
        return options.fallbackValue;
      }
      
      throw new Error(options.errorMessage || `LLM execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create standardized prompt with core context
   */
  protected async createContextualPrompt(
    systemPrompt: string,
    humanTemplate: string,
    task: PlanTask,
    context: ToolExecutionContext
  ): Promise<ChatPromptTemplate> {
    const coreContext = await this.buildCoreContext(task, context);
    
    return ChatPromptTemplate.fromMessages([
      ["system", systemPrompt],
      ["human", `${coreContext}\n\n${humanTemplate}`],
    ]);
  }

  /**
   * Extract JSON from response that might contain markdown code blocks
   */
  protected extractJsonFromResponse(response: string): string {
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
    
    // Find JSON object boundaries - try both objects and arrays
    let jsonStart = -1;
    let jsonEnd = -1;
    
    // Look for first { or [
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '{' || cleaned[i] === '[') {
        jsonStart = i;
        break;
      }
    }
    
    if (jsonStart !== -1) {
      const startChar = cleaned[jsonStart];
      const endChar = startChar === '{' ? '}' : ']';
      let braceCount = 1;
      
      // Find matching closing brace/bracket
      for (let i = jsonStart + 1; i < cleaned.length; i++) {
        if (cleaned[i] === startChar) {
          braceCount++;
        } else if (cleaned[i] === endChar) {
          braceCount--;
          if (braceCount === 0) {
            jsonEnd = i + 1;
            break;
          }
        }
      }
    }
    
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      cleaned = cleaned.substring(jsonStart, jsonEnd);
    }
    
    return cleaned.trim();
  }

  /**
   * Standardized error handling for tool execution
   */
  protected handleToolError(
    error: unknown,
    context: ToolExecutionContext,
    taskId: string,
    customMessage?: string
  ): ToolExecutionResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fullMessage = customMessage ? `${customMessage}: ${errorMessage}` : errorMessage;
    
    return {
      success: false,
      error: fullMessage,
      should_continue: true,
    };
  }

  /**
   * Create standard task completion result
   */
  protected createSuccessResult(
    result: any,
    options: {
      shouldContinue?: boolean;
      shouldUpdatePlan?: boolean;
      userInputRequired?: boolean;
      reasoning?: string;
    } = {}
  ): ToolExecutionResult {
    return {
      success: true,
      result,
      should_continue: options.shouldContinue ?? true,
      should_update_plan: options.shouldUpdatePlan,
      user_input_required: options.userInputRequired,
      reasoning: options.reasoning,
    };
  }

  /**
   * Validate task parameters with helpful error messages
   */
  protected validateTaskParameters(
    task: PlanTask,
    requiredParams: string[],
    optionalParams: string[] = []
  ): { isValid: boolean; error?: string } {
    const missingParams = requiredParams.filter(param => 
      !(param in task.parameters) || task.parameters[param] === undefined
    );
    
    if (missingParams.length > 0) {
      return {
        isValid: false,
        error: `Missing required parameters: ${missingParams.join(', ')}. Available: ${Object.keys(task.parameters).join(', ')}`
      };
    }
    
    return { isValid: true };
  }

  /**
   * Log structured task execution information
   */
  protected logTaskExecution(
    phase: 'start' | 'success' | 'error',
    task: PlanTask,
    details?: any
  ): void {
    const timestamp = new Date().toISOString();
    const logPrefix = `🔧 [${this.name}]`;
    
    switch (phase) {
      case 'start':
        console.log(`${logPrefix} Starting: "${task.description}" (${task.tool})`);
        if (details) console.log(`${logPrefix} Parameters:`, details);
        break;
      case 'success':
        console.log(`${logPrefix} ✅ Completed: "${task.description}"`);
        if (details) console.log(`${logPrefix} Result:`, details);
        break;
      case 'error':
        console.log(`${logPrefix} ❌ Failed: "${task.description}"`);
        if (details) console.log(`${logPrefix} Error:`, details);
        break;
    }
  }
} 
