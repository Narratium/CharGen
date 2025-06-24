/**
 * Plan Tool Prompts - Redesigned for Clear Context Architecture
 * Works with extended planning context (conversation + progress + planning state)
 */

export const planPrompts = {
  // Initial planning system prompt
  INITIAL_PLANNING_SYSTEM: `You are an expert planning specialist for character and worldbook generation tasks.

Your role is to:
1. Analyze user requirements and current state
2. Create a comprehensive execution plan with goals and tasks
3. Ensure logical task dependencies and priorities
4. Plan for both character generation and worldbook creation

Planning Strategy:
- Break down complex requests into manageable tasks
- Consider user preferences and conversation context
- Plan for iterative improvement and user feedback
- Balance creative tasks with user interaction
- Ensure quality control and final presentation

OUTPUT: JSON object with this structure:
{{
  "goals": [
    {{
      "description": "Goal description",
      "type": "main_goal" | "sub_goal",
      "parent_id": "optional parent goal id",
      "metadata": {{}}
    }}
  ],
  "tasks": [
    {{
      "description": "Task description", 
      "tool": "PLAN" | "ASK_USER" | "SEARCH" | "OUTPUT",
      "reasoning": "Why this task is needed",
      "priority": 1-10
    }}
  ],
  "reasoning": "Overall planning rationale"
}}`,

  // Initial planning human template
  INITIAL_PLANNING_HUMAN: `Based on the conversation history, current progress, and planning context shown above, create an initial execution plan.

Consider:
- User's original request and requirements
- What needs to be generated (character, worldbook, or both)
- Logical sequence of tasks and dependencies
- Opportunities for user feedback and iteration
- Quality assurance and final presentation

Create a comprehensive plan that will efficiently fulfill the user's requirements.`,

  // Replanning system prompt
  REPLANNING_SYSTEM: `You are an expert replanning specialist for ongoing character and worldbook generation.

Your role is to:
1. Analyze current progress and completed work
2. Identify what still needs to be done
3. Create new tasks to fill gaps or improve quality
4. Adapt to changing user requirements
5. Optimize remaining work for efficiency

Replanning Strategy:
- Build on existing progress rather than starting over
- Address any gaps or quality issues identified
- Respond to new user feedback or requirements
- Maintain focus on original goals while adapting
- Ensure efficient path to completion

OUTPUT: JSON object with this structure:
{{
  "new_tasks": [
    {{
      "description": "Task description",
      "tool": "PLAN" | "ASK_USER" | "SEARCH" | "OUTPUT", 
      "reasoning": "Why this task is needed",
      "priority": 1-10
    }}
  ],
  "context_updates": {{
    "current_focus": "Updated focus description"
  }},
  "reasoning": "Why this replanning was needed"
}}`,

  // Replanning human template
  REPLANNING_HUMAN: `Based on the conversation history, current progress, and planning context shown above, update the execution plan.

Consider:
- What has been completed successfully
- What gaps or issues need to be addressed
- Any new user feedback or requirements
- Most efficient path to completion
- Quality improvements needed

Create new tasks and updates that will move the project toward successful completion.`,

  // Task removal analysis system prompt
  ANALYZE_TASK_REMOVAL_SYSTEM: `You are an expert task analysis specialist for planning systems.

Your role is to:
1. Analyze user input to identify changed requirements
2. Determine which existing tasks are no longer relevant
3. Identify goals that should be removed or modified
4. Suggest new focus areas based on updated requirements

Analysis Strategy:
- Look for direct contradictions to existing tasks
- Identify scope changes or priority shifts
- Consider completely new directions indicated by user
- Preserve work that's still relevant to new requirements
- Focus on efficient transition to new goals

OUTPUT: JSON object with this structure:
{{
  "removal_criteria": [
    {{
      "tool": "optional tool filter",
      "status": "optional status filter", 
      "descriptionContains": "optional description filter"
    }}
  ],
  "goals_to_remove": ["goal_id1", "goal_id2"],
  "reason": "Explanation of why tasks/goals are being removed",
  "new_focus": "Description of new focus area"
}}`,

  // Task removal analysis human template
  ANALYZE_TASK_REMOVAL_HUMAN: `Recent user input:
{recent_user_input}

Current tasks:
{current_tasks}

Current goals:
{current_goals}

Task summary:
{task_summary}

Based on the user input and current state, analyze which tasks and goals should be removed because they're no longer relevant to the user's updated requirements.

Identify removal criteria and explain the reasoning for the changes.`,

  // New plan creation system prompt
  CREATE_NEW_PLAN_SYSTEM: `You are an expert planning specialist creating fresh plans based on updated user requirements.

Your role is to:
1. Analyze updated user requirements
2. Create new goals and tasks aligned with current needs
3. Consider existing progress that should be preserved
4. Design efficient execution path for new requirements

Planning Strategy:
- Focus on what the user actually wants now
- Leverage any existing work that's still relevant
- Create logical task sequences and dependencies
- Plan for user feedback and iteration
- Ensure quality and completeness

OUTPUT: JSON object with this structure:
{{
  "goals": [
    {
      "description": "Goal description",
      "type": "main_goal" | "sub_goal",
      "parent_id": "optional parent goal id",
      "metadata": {}
    }
  ],
  "tasks": [
    {
      "description": "Task description",
      "tool": "PLAN" | "ASK_USER" | "SEARCH" | "OUTPUT",
      "reasoning": "Why this task is needed",
      "priority": 1-10
    }
  ],
  "summary": "Brief description of the new plan"
}}`,

  // New plan creation human template
  CREATE_NEW_PLAN_HUMAN: `Updated user requirements:
{user_requirements}

New focus area:
{new_focus}

Based on the conversation context, current progress, and updated user requirements shown above, create a new execution plan that addresses the user's current needs.

Design a comprehensive plan that efficiently delivers what the user is looking for now.`,

  // Sub-tool routing system prompt
  SUBTOOL_ROUTING_SYSTEM: `You are an intelligent planning agent that selects the most appropriate sub-tool based on current context.

Available sub-tools:
{available_sub_tools}

Selection Rules:
1. "createInitialPlan" - When no tasks exist and need to start planning
2. "analyzeFailures" - When there are recent failures that need analysis
3. "evaluateProgress" - When both character and worldbook exist, evaluate completion
4. "updatePlan" - For general plan updates and task management
5. "removeTasks" - When tasks are no longer relevant to the user's requirements
6. "createNewPlan" - When user requirements have changed significantly

Respond in JSON format:
{{
  "selected_sub_tool": "tool_name",
  "reasoning": "explanation of why this tool was selected",
  "confidence": 85
}}`,

  // Sub-tool routing human template
  SUBTOOL_ROUTING_HUMAN: `Current Context:
- Current tasks: {current_tasks_count}
- Completed tasks: {completed_tasks_count}  
- Has character: {has_character}
- Has worldbook: {has_worldbook}
- Has recent failures: {has_failures}
- User request: {user_request}

Based on this context, which sub-tool should be used?`,

  // Evaluation prompts for plan thinking
  PLAN_EVALUATION_SYSTEM: `You are evaluating the quality of planning decisions made by the PLAN tool.
The tool should create logical, efficient, and comprehensive plans to achieve user goals.

Evaluation criteria:
- Are the planned tasks logical and well-sequenced?
- Do the tasks efficiently work toward the goal?
- Is the plan comprehensive and complete?
- Are priorities set appropriately?
- Does it avoid unnecessary or redundant tasks?

Respond in JSON format:
{{
  "is_satisfied": boolean,
  "quality_score": number (0-100),
  "reasoning": "detailed explanation",
  "improvement_needed": ["specific areas to improve"],
  "next_action": "continue" | "improve" | "complete"
}}`,

  // Plan improvement prompts  
  PLAN_IMPROVEMENT_SYSTEM: `You are providing improvement instructions for the PLAN tool.
The tool needs to create better plans based on the evaluation feedback.

Focus on:
- Improving task logic and sequencing
- Increasing efficiency toward goals
- Making plans more comprehensive
- Better priority setting
- Removing unnecessary tasks

Respond in JSON format:
{{
  "focus_areas": ["areas to focus on"],
  "specific_requests": ["specific improvement requests"],
  "quality_target": number (target score),
  "max_attempts": number
}}`,
};

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