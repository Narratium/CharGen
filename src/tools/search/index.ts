import { 
  ToolType, 
  ExecutionContext, 
  ExecutionResult 
} from "../../models/agent-model";
import { BaseSimpleTool, ToolParameter } from "../base-tool";
import { TavilySearch } from "@langchain/tavily";

/**
 * Enhanced Search Tool - Tavily API implementation
 * Uses Tavily's professional search API for reliable and high-quality search results
 */
export class SearchTool extends BaseSimpleTool {
  readonly toolType = ToolType.SEARCH;
  readonly name = "SEARCH";
  readonly description = "Search for information using Tavily API. USE PRIMARILY when the story relates to existing real-world content like anime, novels, games, movies, or specific cultural references that require accurate information. Also use when you need specific factual details, historical context, or cultural elements that cannot be creatively invented. Do NOT use for generic creative content that can be imagined - only use when accuracy about existing works or real-world elements is essential for the story.";
  
  readonly parameters: ToolParameter[] = [
    {
      name: "query",
      type: "string",
      description: "The specific search query to execute. The tool will use Tavily's professional search API to gather comprehensive information for character/worldbook generation",
      required: true
    }
  ];

  private tavilySearch: TavilySearch;

  constructor() {
    super();
    // Note: Tavily Search will be initialized with API key from context in doWork method
    this.tavilySearch = null as any; // Will be initialized with API key from context
  }

  protected async doWork(parameters: Record<string, any>, context: ExecutionContext): Promise<ExecutionResult> {
    const query = parameters.query;
    
    if (!query || typeof query !== 'string') {
      return this.createFailureResult("SEARCH tool requires 'query' parameter as a non-empty string.");
    }

    // Check if Tavily API key is configured
    const tavilyApiKey = context.llm_config.tavily_api_key;
    if (!tavilyApiKey || tavilyApiKey.trim() === '') {
      return this.createFailureResult("Tavily API key not configured. Please run 'char-gen config' to set up your Tavily API key.");
    }

    console.log("Tavily API key:", tavilyApiKey);
    try {
      console.log(`🔍 Starting Tavily search for: "${query}"`);
      this.tavilySearch = new TavilySearch({
        tavilyApiKey: tavilyApiKey,
          maxResults: 8, // Increased for better coverage
          topic: "general",
          includeAnswer: false, // We'll process results ourselves
          includeRawContent: false, // Keep response size manageable
          includeImages: false, // Focus on text content
          searchDepth: "advanced", // Use advanced search for better quality
          // API key will be set via environment variable
        });
        
        // Set the API key via environment variable (Tavily's expected method)
        process.env.TAVILY_API_KEY = tavilyApiKey;
        console.log("Tavily API key set via environment variable:", process.env.TAVILY_API_KEY);
      
      
      // Use Tavily search directly
      const searchResult = await this.tavilySearch.invoke({ query });
      
      // Parse the Tavily response
      const searchData = typeof searchResult === 'string' ? JSON.parse(searchResult) : searchResult;
      
      if (!searchData.results || !Array.isArray(searchData.results)) {
        throw new Error('Invalid search response format from Tavily');
    }
    
      // Convert Tavily results to knowledge entries
      const knowledgeEntries = searchData.results.map((result: any) => 
        this.createKnowledgeEntry(
          result.title || "Search Result",
          result.content || result.snippet || "",
          result.url || "Unknown",
          Math.round((result.score || 0.5) * 100) // Convert score to percentage
        )
      );

      console.log(`✅ Tavily search completed: ${knowledgeEntries.length} knowledge entries created`);

      return this.createSuccessResult({
        query,
        results_count: knowledgeEntries.length,
        sources: searchData.results.map((r: any) => r.title || r.url).slice(0, 5),
        search_method: "tavily_advanced",
        response_time: searchData.response_time || 0,
        knowledge_entries: knowledgeEntries
      });
    } catch (error) {
      console.error(`❌ Tavily search failed for "${query}":`, error);
      return this.createFailureResult(`Tavily search failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  }
} 