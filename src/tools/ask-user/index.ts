import { 
  ToolType, 
  ExecutionContext, 
  ExecutionResult,
  UserInteraction
} from "../../models/agent-model";
import { BaseSimpleTool, ToolParameter, DetailedToolInfo } from "../base-tool";
import { v4 as uuidv4 } from 'uuid';

/**
 * Ask User Tool - Pure Execution Unit
 * Formats a question provided by the planner to be presented to the user.
 */
export class AskUserTool extends BaseSimpleTool {
  readonly toolType = ToolType.ASK_USER;
  readonly name = "ASK_USER";
  readonly description = "Presents a question to the user to gather more information.";
  
  readonly parameters: ToolParameter[] = [
    {
      name: "question",
      type: "string",
      description: "The complete, well-formed question text to present to the user. Should be clear, specific, and actionable.",
      required: true
    }
  ];

  getToolInfo(): DetailedToolInfo {
    return {
      type: ToolType.ASK_USER,
      name: this.name,
      description: this.description,
      parameters: this.parameters
    };
  }

  protected async doWork(parameters: Record<string, any>, context: ExecutionContext): Promise<any> {
    const questionText = parameters.question;
    
    if (!questionText || typeof questionText !== 'string') {
        throw new Error("ASK_USER tool requires a 'question' parameter of type string.");
    }
    
    console.log(`❓ Formatting user question: "${questionText}"`);
    
    // Create user interaction entry to log the question
    const userInteraction: UserInteraction = {
        id: uuidv4(),
        question: questionText,
        is_initial: false,
        timestamp: new Date().toISOString(),
        status: 'pending',
    };

    console.log(`✅ User question formatted for engine.`);

    return {
      message: questionText, // This will be shown to the user by the engine
      interaction_updates: [userInteraction] // This will be saved to the research state
    };
  }
} 