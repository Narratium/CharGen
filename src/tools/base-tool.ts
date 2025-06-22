import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/ollama";
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
   * Execute the tool with the given task and context
   */
  abstract executeTask(task: PlanTask, context: ToolExecutionContext): Promise<ToolExecutionResult>;

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
} 
