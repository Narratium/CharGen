import { 
  ToolType, 
  ExecutionContext, 
  ExecutionResult 
} from "../../models/agent-model";
import { BaseSimpleTool, ToolParameter, DetailedToolInfo } from "../base-tool";

/**
 * Search Tool - Pure Execution Unit
 * Performs web search based on provided parameters from planner
 */
export class SearchTool extends BaseSimpleTool {
  readonly toolType = ToolType.SEARCH;
  readonly name = "SEARCH";
  readonly description = "Execute search queries and update knowledge base with results";
  
  readonly parameters: ToolParameter[] = [
    {
      name: "query",
      type: "string",
      description: "The specific search query to execute. Should be detailed and focused on gathering information for character/worldbook generation",
      required: true
    },
    {
      name: "focus",
      type: "string", 
      description: "Focus area for the search to help categorize and prioritize results",
      required: true,
      options: ["character", "worldbook", "lore", "general"]
    }
  ];

  getToolInfo(): DetailedToolInfo {
    return {
      type: ToolType.SEARCH,
      name: this.name,
      description: this.description,
      parameters: this.parameters
    };
  }

  protected async doWork(parameters: Record<string, any>, context: ExecutionContext): Promise<any> {
    const query = parameters.query;
    const focus = parameters.focus || "general";
    
    if (!query) {
      throw new Error("Search query is required");
    }

    console.log(`🔍 Searching for: "${query}" (focus: ${focus})`);

    // Simulate web search - in real implementation, this would call actual search API
    const searchResults = await this.performWebSearch(query, focus);
    
    // Create knowledge entries from search results
    const knowledgeEntries = searchResults.map(result => 
      this.createKnowledgeEntry(
        result.source,
        result.content,
        result.url,
        result.relevance
      )
    );

    console.log(`✅ Search completed: ${knowledgeEntries.length} results found`);

    return {
      query,
      focus,
      results_count: knowledgeEntries.length,
      search_summary: `Found ${knowledgeEntries.length} results for "${query}"`,
      knowledge_updates: knowledgeEntries
    };
  }

  /**
   * Perform actual web search (simulation)
   */
  private async performWebSearch(query: string, focus: string): Promise<any[]> {
    // Simulate search delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simulate search results based on query and focus
    const mockResults = [
      {
        source: `Search Result 1 for "${query}"`,
        content: `Detailed information about ${query} relevant to ${focus}. This would contain actual search content from web sources.`,
        url: `https://example.com/search/${encodeURIComponent(query)}`,
        relevance: 85
      },
      {
        source: `Search Result 2 for "${query}"`,
        content: `Additional context and details about ${query} that helps with ${focus} development.`,
        url: `https://example.com/resource/${encodeURIComponent(query)}`,
        relevance: 78
      }
    ];

    return mockResults;
  }
} 