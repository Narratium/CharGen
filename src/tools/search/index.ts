import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ToolType, ExecutionContext, KnowledgeEntry } from "../../models/agent-model";
import { BaseSimpleTool } from "../base-tool";

/**
 * Search Tool - Simple execution unit for information gathering
 * Updates knowledge base after search
 */
export class SearchTool extends BaseSimpleTool {
  readonly toolType = ToolType.SEARCH;
  readonly name = "Search Tool";
  readonly description = "Search for information to fill knowledge gaps and update knowledge base";
  readonly parameters = [
    {
      name: "query",
      type: "string" as const,
      description: "Search query or topic to research",
      required: true,
    },
    {
      name: "focus",
      type: "string" as const,
      description: "Specific focus area for the search",
      required: false,
      default: "general",
      options: ["character", "worldbook", "personality", "background", "general"],
    },
  ];

  /**
   * Execute search and update knowledge base
   */
  protected async doWork(context: ExecutionContext, parameters: Record<string, any>): Promise<any> {
    const query = parameters.query || parameters.search_query || "character creation information";
    const focus = parameters.focus || "general";
    
    console.log(`🔍 Searching for: ${query} (Focus: ${focus})`);
    
    // Add search action message
    await this.addMessage(
      context.session_id,
      "agent",
      `Searching for information: ${query}`,
      "agent_action",
      { search_query: query, focus }
    );

    // Perform the search using LLM
    const searchResults = await this.performSearch(context, query, focus);
    
    // Create knowledge entries from search results
    const knowledgeUpdates = this.createKnowledgeEntries(searchResults, query);
    
    // Update search coverage progress
    await this.updateSearchProgress(context);
    
    console.log(`✅ Found ${knowledgeUpdates.length} relevant pieces of information`);
    
    return {
      search_query: query,
      results_count: knowledgeUpdates.length,
      knowledge_entries: knowledgeUpdates,
      summary: this.summarizeSearchResults(searchResults),
      knowledgeUpdates // This will be used to update the knowledge base
    };
  }

  /**
   * Perform search using LLM knowledge
   */
  private async performSearch(context: ExecutionContext, query: string, focus: string): Promise<any[]> {
    const prompt = ChatPromptTemplate.fromTemplate(`
You are a research assistant helping to create character cards and worldbooks.

Current Task Context:
{task_context}

Current Knowledge Base:
{knowledge_base}

User Questions:
{user_questions}

Search Query: {query}
Search Focus: {focus}

Based on the search query and current context, provide relevant information that would help with character creation and worldbook development. 

Focus on:
- Character development details (personality, background, motivations)
- World building elements (settings, lore, rules)
- Creative writing techniques
- Character interaction patterns
- Story development approaches

Return your response in JSON format:
{{
  "search_results": [
    {{
      "source": "source name or type",
      "title": "title of information",
      "content": "detailed content",
      "relevance_score": 1-100,
      "category": "character|world|technique|interaction|story"
    }}
  ],
  "search_summary": "brief summary of what was found",
  "additional_suggestions": ["suggestion1", "suggestion2"]
}}
`);

    const response = await this.executeLLMChain(
      prompt,
      {
        task_context: this.buildTaskContextSummary(context),
        knowledge_base: this.buildKnowledgeBaseSummary(context.research_state.knowledge_base),
        user_questions: this.buildUserInteractionsSummary(context.research_state.user_interactions),
        query,
        focus,
      },
      context,
      { parseJson: true, errorMessage: "Search execution failed" }
    );

    return response.search_results || [];
  }

  /**
   * Create knowledge entries from search results
   */
  private createKnowledgeEntries(searchResults: any[], query: string): KnowledgeEntry[] {
    return searchResults.map(result => 
      this.createKnowledgeEntry(
        result.source || "AI Search",
        result.content || result.title || "No content",
        undefined, // No URL for LLM-based search
        result.relevance_score || 70
      )
    );
  }

  /**
   * Update search coverage progress
   */
  private async updateSearchProgress(context: ExecutionContext): Promise<void> {
    const currentCoverage = context.research_state.progress.search_coverage;
    const increment = Math.min(15, 100 - currentCoverage); // Increase by 15%, max 100%
    
    // Note: In real implementation, this would update via ResearchSessionOperations
    // For now, we'll return it in the result for the engine to handle
  }

  /**
   * Summarize search results for logging
   */
  private summarizeSearchResults(results: any[]): string {
    if (results.length === 0) {
      return "No relevant information found";
    }
    
    const categories = results.reduce((acc, result) => {
      const category = result.category || "general";
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});
    
    const categoryText = Object.entries(categories)
      .map(([cat, count]) => `${count} ${cat}`)
      .join(", ");
    
    return `Found ${results.length} results: ${categoryText}`;
  }
} 