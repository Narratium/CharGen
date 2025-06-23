import { ToolExecutionContext, PlanTask } from "../../models/agent-model";

/**
 * Plan Tool Prompts - All prompt templates for planning functionality
 */
export class PlanPrompts {
  /**
   * Get available tools description
   */
  static getAvailableToolsDescription(): string {
    const availableTools = ["ASK_USER", "SEARCH", "OUTPUT"];
    return availableTools.map(tool => {
      switch (tool) {
      case "ASK_USER": return "- ASK_USER: Ask user for additional information or clarification";
      case "SEARCH": return "- SEARCH: Search for inspiration, references, and creative ideas";
      case "OUTPUT": return "- OUTPUT: Generate character data and worldbook entries";
      default: return `- ${tool}: Unknown tool`;
      }
    }).join("\n");
  }

  /**
   * System prompt for initial planning
   */
  static getInitialPlanningSystemPrompt(): string {
    return `You are an intelligent planning agent for character and worldbook generation.

Your mission: Create character cards and worldbooks progressively, step by step, based on user requirements.

AVAILABLE TOOLS:
${this.getAvailableToolsDescription()}

CORE PRINCIPLES:
1. Always work progressively - build on existing results
2. If tools have failed multiple times (3+), use different approaches
3. Character and worldbook should be cohesive and detailed
4. Focus on what's missing or needs improvement in current results

Respond in JSON format:
{
  "reasoning": "Your detailed reasoning based on current status and context",
  "confidence": 0.8,
  "goals": [
    {
      "description": "Goal description",
      "type": "main_goal|sub_goal",
      "parent_id": "parent_goal_id_if_any",
      "metadata": {}
    }
  ],
  "tasks": [
    {
      "description": "Clear, specific description of what needs to be accomplished", 
      "tool": "TOOL_NAME",
      "dependencies": [],
      "priority": 1-10,
      "reasoning": "Why this task is needed and why this tool was chosen based on current context"
    }
  ],
  "alternatives": ["Alternative approaches considered"]
}`;
  }

  /**
   * Human template for initial planning
   */
  static getInitialPlanningHumanTemplate(): string {
    return `TASK: Create initial execution plan for character and worldbook generation.

Based on the current status above, create a plan that:
1. Builds on existing results (if any)
2. Addresses what's missing
3. Avoids repeating failed approaches
4. Follows a logical progression

Focus on creating a COMPLETE character and worldbook that work together.`;
  }

  /**
   * System prompt for replanning
   */
  static getReplanningSystemPrompt(): string {
    return `You are updating the execution plan for character and worldbook generation.

Your mission: Progressively improve and complete the character card and worldbook based on current status.

AVAILABLE TOOLS:
${this.getAvailableToolsDescription()}

REPLANNING PRINCIPLES:
1. Analyze current results and identify gaps
2. Build incrementally on existing work
3. Avoid repeating failed approaches - learn from failures
4. Prioritize what's most needed next
5. Ensure character and worldbook are cohesive and complete

CRITICAL RULES:
- If a tool has failed 3+ times, use different approaches
- Consider why previous attempts failed
- Focus on missing or incomplete components
- Maintain consistency with existing results

Respond in JSON format:
{
  "reasoning": "Detailed analysis of current status and why these updates are needed",
  "confidence": 0.7,
  "new_tasks": [
    {
      "description": "Specific, actionable description of what needs to be accomplished",
      "tool": "TOOL_NAME", 
      "dependencies": [],
      "priority": 1-10,
      "reasoning": "Why this task is needed and why this tool was chosen based on current context and failures"
    }
  ],
  "context_updates": {
    "current_focus": "What to focus on next based on current status"
  },
  "alternatives": ["Alternative approaches considered to avoid repeating failures"]
}`;
  }

  /**
   * Human template for replanning
   */
  static getReplanningHumanTemplate(): string {
    return `TASK: Update the execution plan based on current progress.

Based on the comprehensive status above:
1. What has been completed successfully?
2. What is still missing or incomplete?
3. What failures should be avoided?
4. What is the most logical next step?

Create new tasks that move us closer to a complete, high-quality character and worldbook generation.`;
  }

  /**
   * Get failure analysis suggestions for different tools
   */
  static getFailureAnalysisSuggestions(tool: string, count: number): string[] {
    const suggestions = [];
    
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
    
    return suggestions;
  }
} 