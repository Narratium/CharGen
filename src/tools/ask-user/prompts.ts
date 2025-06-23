/**
 * Ask User Tool Prompts - All prompt templates for intelligent question generation
 */
export class AskUserPrompts {
  /**
   * System prompt for generating contextual questions
   */
  static getQuestionGenerationSystemPrompt(): string {
    return `You are an expert character and worldbook creator specializing in asking the RIGHT questions to gather critical missing information.

MISSION: Generate intelligent, contextual questions based on comprehensive project status to gather exactly what's needed for the current task.

QUESTION GENERATION PRINCIPLES:
1. Analyze current results to identify specific gaps and needs
2. Build on existing work rather than starting from scratch
3. Focus on the most critical missing pieces for the current task
4. Ask specific, actionable questions that provide clear direction
5. Consider user's progress, failures, and recent context
6. Balance creativity with practical constraints

QUESTION STRATEGY:
- If no character exists: Focus on core character concept, personality, role
- If character exists but incomplete: Ask about specific missing details
- If no worldbook exists: Focus on setting, atmosphere, key world elements  
- If worldbook exists but sparse: Ask about specific world expansion areas
- If failures occurred: Ask about alternative approaches or preferences
- Always consider user's original vision and current project direction

OUTPUT FORMAT:
Generate a natural, engaging conversational message that includes 3-5 focused, specific questions. Be encouraging and show understanding of their creative vision.`;
  }

  /**
   * Human template for question generation
   */
  static getQuestionGenerationHumanTemplate(): string {
    return `TASK: Generate contextual questions for "{task_description}"

Based on the comprehensive project status above:
1. What critical information is missing for this specific task?
2. What gaps exist in current results that need user input?
3. What failures or challenges suggest I need user guidance?
4. What aspects of the user's vision need clarification?

Generate specific, helpful questions that will gather exactly what I need to complete this task successfully while building on existing work.`;
  }

  /**
   * Get fallback questions based on task analysis
   */
  static generateFallbackQuestions(taskDescription: string, userRequest: string, hasCharacter: boolean, hasWorldbook: boolean): string {
    const taskDesc = taskDescription.toLowerCase();
    
    // Analyze task description to determine question focus
    if (taskDesc.includes("requirement") || taskDesc.includes("preference") || taskDesc.includes("tone") || taskDesc.includes("style")) {
      return `I need to understand your preferences better to create the perfect character and worldbook. Based on your request "${userRequest}" and the current task "${taskDescription}", could you tell me:

1. What kind of tone or atmosphere are you looking for? (e.g., dark and gritty, hopeful and heroic, mysterious and magical)
2. Are there any specific themes or elements you want emphasized?
3. What aspects of this concept excite you most?
4. Any particular style or inspiration sources you'd like me to draw from?`;

    } else if (taskDesc.includes("character") || taskDesc.includes("personality") || taskDesc.includes("background")) {
      return `I'm working on the character details for your request. To make them compelling and unique, I need to understand:

1. What kind of personality should this character have? What drives them?
2. What's their role or position in this world? Are they a leader, rebel, survivor, etc.?
3. What challenges or conflicts do they face?
4. Any specific traits, abilities, or background elements you envision?`;

    } else if (taskDesc.includes("world") || taskDesc.includes("setting") || taskDesc.includes("environment") || taskDesc.includes("location")) {
      return `I'm developing the world and setting for your concept. To create a rich, immersive environment, could you help me with:

1. What does this world feel like? What's the overall atmosphere?
2. What are the key locations or environments that matter?
3. What kind of society or social structure exists?
4. Are there any unique rules, technologies, or magical elements in this world?`;

    } else if (taskDesc.includes("clarif") || taskDesc.includes("detail") || taskDesc.includes("specific")) {
      return `I need some additional details to continue with "${taskDescription}". Could you provide more information about:

1. What specific aspects are most important to you?
2. Are there any particular directions you'd like me to take?
3. What elements should I focus on or avoid?
4. Any additional context that might help me better understand your vision?`;

    } else {
      // General fallback based on current progress
      if (!hasCharacter && !hasWorldbook) {
        return `I'm getting started on your request "${userRequest}". To create the best character and worldbook, I need to understand:

1. What's the core concept or theme you want to explore?
2. What kind of character would fit this world?
3. What mood or atmosphere should this have?
4. Any specific elements or constraints I should consider?`;
      } else {
        return `I'm continuing work on your character and worldbook. For the current task "${taskDescription}", could you provide more details about what you'd like me to focus on or any specific preferences you have?`;
      }
    }
  }
} 