/**
 * Search Tool Prompts - All prompt templates for creative inspiration gathering
 */
export class SearchPrompts {
  /**
   * System prompt for inspiration generation
   */
  static getInspirationGenerationSystemPrompt(): string {
    return `You are an expert creative inspiration generator specializing in character and worldbuilding concepts.

MISSION: Generate diverse, creative inspiration based on project context to enhance character and worldbook development.

INSPIRATION GENERATION PRINCIPLES:
1. Analyze current project status to identify what kind of inspiration is most needed
2. Generate varied, unexpected but relevant creative directions
3. Consider gaps in existing character or world elements
4. Balance familiar and novel concepts for engaging creativity
5. Provide specific, actionable creative elements rather than vague suggestions
6. Connect inspiration to the user's original vision and current progress

INSPIRATION STRATEGY:
- For character development: Personality quirks, background elements, motivations, relationships
- For worldbuilding: Cultural details, historical events, unique systems, atmospheric elements
- For both: Visual imagery, thematic connections, interesting conflicts or contrasts
- Always consider how inspiration enhances rather than overwhelms existing work

RESPONSE FORMAT:
Generate creative inspiration as a structured collection including:
- Core concepts and themes
- Specific details and elements
- Visual or atmospheric inspiration
- Character hooks or world elements
- Potential story directions

Be specific, vivid, and immediately usable for creative development.`;
  }

  /**
   * Human template for inspiration generation
   */
  static getInspirationGenerationHumanTemplate(): string {
    return `TASK: Generate creative inspiration for "{task_description}"

Based on the comprehensive project context above:
1. What kind of inspiration would best serve the current task?
2. What gaps in character or world development could creative inspiration fill?
3. What themes or elements from the user's vision need creative expansion?
4. How can I provide inspiration that builds on existing work rather than conflicting with it?

Generate specific, actionable creative inspiration that will help complete this task while staying true to the user's vision.`;
  }

  /**
   * Get fallback inspiration based on task focus
   */
  static generateFallbackInspiration(taskDescription: string, userRequest: string, hasCharacter: boolean, hasWorldbook: boolean): string {
    const taskDesc = taskDescription.toLowerCase();
    
    // Determine inspiration focus based on task
    if (taskDesc.includes("character") || taskDesc.includes("personality") || taskDesc.includes("background")) {
      return `🎭 **Character Inspiration**

**Personality Concepts:**
• The protective pessimist who expects the worst but fights to prevent it
• Someone who collects seemingly useless objects that hold deep personal meaning
• A character who speaks differently to different people, revealing layers of their identity
• The reluctant expert who knows more than they want to admit

**Background Elements:**
• Raised by someone other than their parents, creating complex loyalties
• Possesses a skill learned under unusual or secretive circumstances
• Has experienced a moment that completely changed their worldview
• Carries both a burden and a gift from their past

**Motivational Hooks:**
• Seeking to prove themselves worthy of something they've already lost
• Trying to protect others from making their same mistakes
• Driven by a promise they can no longer remember making
• Balancing personal desires with inherited responsibilities`;

    } else if (taskDesc.includes("world") || taskDesc.includes("setting") || taskDesc.includes("environment")) {
      return `🌍 **World Inspiration**

**Cultural Elements:**
• Society where different professions have distinct seasonal ceremonies
• Communities that value memory keepers and storytellers above warriors
• Places where social status is determined by artistic contribution rather than wealth
• Groups who communicate important information through decorative art

**Environmental Features:**
• Locations where natural phenomena create unique daily rhythms
• Places where the landscape itself holds memories or echoes of past events
• Environments that change based on the collective mood of inhabitants
• Regions where unusual resources have shaped unique technologies or traditions

**Atmospheric Details:**
• The sound of bells that carry different meanings at different times of day
• Markets where vendors trade in intangible goods alongside physical ones
• Architecture that reflects the values and fears of its builders
• Natural landmarks that serve as both navigation aids and cultural symbols`;

    } else {
      // General creative inspiration
      return `✨ **Creative Inspiration**

**Thematic Concepts:**
• The tension between tradition and necessary change
• Hidden connections between seemingly unrelated events
• The weight of secrets and the freedom of truth
• Beauty found in unexpected or overlooked places

**Visual & Atmospheric:**
• Spaces where light behaves differently than expected
• Objects that seem ordinary but carry extraordinary significance
• Contrasts between what something appears to be and what it truly is
• Environments that evoke specific emotions or memories

**Character & World Connections:**
• How personal history shapes perception of current events
• The intersection of individual choices and larger forces
• Relationships that challenge assumptions and force growth
• Conflicts between different ways of understanding the world`;
    }
  }
} 