import { 
  ToolType, 
  ExecutionContext, 
  ExecutionResult 
} from "../../models/agent-model";
import { BaseSimpleTool, ToolParameter } from "../base-tool";
import { DuckDuckGoSearch } from "@langchain/community/tools/duckduckgo_search";
import { WikipediaQueryRun } from "@langchain/community/tools/wikipedia_query_run";

/**
 * Enhanced Search Tool - Multi-source search implementation
 * Uses LangChain community tools for reliable web search and knowledge retrieval
 */
export class SearchTool extends BaseSimpleTool {
  readonly toolType = ToolType.SEARCH;
  readonly name = "SEARCH";
  readonly description = "Execute multi-source search queries and update knowledge base with reliable results";
  
  readonly parameters: ToolParameter[] = [
    {
      name: "query",
      type: "string",
      description: "The specific search query to execute. The tool will automatically use multiple search sources (Wikipedia, web search) to gather comprehensive information for character/worldbook generation",
      required: true
    }
  ];

  private duckDuckGoSearch: DuckDuckGoSearch;
  private wikipediaSearch: WikipediaQueryRun;

  constructor() {
    super();
    // Initialize search tools
    this.duckDuckGoSearch = new DuckDuckGoSearch({ maxResults: 5 });
    this.wikipediaSearch = new WikipediaQueryRun({
      topKResults: 3,
      maxDocContentLength: 4000,
    });
  }

  protected async doWork(parameters: Record<string, any>, context: ExecutionContext): Promise<ExecutionResult> {
    const query = parameters.query;
    
    if (!query || typeof query !== 'string') {
      return this.createFailureResult("SEARCH tool requires 'query' parameter as a non-empty string.");
    }

    try {
      console.log(`🔍 Starting comprehensive search for: "${query}"`);
      
      // Always use comprehensive search with multiple sources
      const searchResults = await this.performComprehensiveSearch(query);
    
    // Create knowledge entries from search results
    const knowledgeEntries = searchResults.map(result => 
      this.createKnowledgeEntry(
        result.source,
        result.content,
          result.url || result.metadata?.source || "Unknown",
          result.relevance || 75
      )
    );

      console.log(`✅ Search completed: ${knowledgeEntries.length} knowledge entries created from ${searchResults.length} sources`);

    return this.createSuccessResult(
      {
        query,
          results_count: knowledgeEntries.length,
          sources: searchResults.map(r => r.source).slice(0, 5), // Top 5 sources
          search_methods: searchResults.map(r => r.type).filter((v, i, a) => a.indexOf(v) === i), // Unique search methods used
          knowledge_entries: knowledgeEntries // Include the actual knowledge entries for AgentEngine to save
        },
      );
    } catch (error) {
      console.error(`❌ Search failed for "${query}":`, error);
      return this.createFailureResult(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Perform web search using DuckDuckGo
   */
  private async performWebSearch(query: string): Promise<any[]> {
    const webResults = await this.duckDuckGoSearch.invoke(query);
    
    // Parse DuckDuckGo results (they come as a string)
    const results = this.parseDuckDuckGoResults(webResults);
    
    return results.map(result => ({
      source: `Web: ${result.title}`,
      content: result.snippet,
      url: result.link,
      type: "web",
      relevance: 80
    }));
  }

  /**
   * Perform Wikipedia search for encyclopedic content
   */
  private async performWikipediaSearch(query: string): Promise<any[]> {
    const wikiResult = await this.wikipediaSearch.invoke(query);
    
    if (wikiResult && wikiResult.trim()) {
      return [{
        source: `Wikipedia: ${query}`,
        content: wikiResult,
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(query.replace(/\s+/g, '_'))}`,
        type: "wiki",
        relevance: 90
      }];
    }
    
    return [];
  }

  /**
   * Perform comprehensive search using multiple sources simultaneously
   * This method automatically uses all available search methods for maximum coverage
   * If any search method fails, the error will propagate up and cause the tool to fail
   */
  private async performComprehensiveSearch(query: string): Promise<any[]> {
    console.log(`📚 Wikipedia search for: "${query}"`);
    console.log(`🌐 Web search for: "${query}"`);
    
    // Execute multiple searches in parallel - let errors propagate naturally
    const [wikiResults, webResults] = await Promise.all([
      this.performWikipediaSearch(query),
      this.performWebSearch(query)
    ]);
    
    // Combine results
    const results = [...wikiResults, ...webResults];
    
    // Sort by relevance score (highest first)
    results.sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
    
    console.log(`📊 Search summary: ${wikiResults.length} Wikipedia + ${webResults.length} Web = ${results.length} total results`);
    
    // If no results found from any source, this is a legitimate failure
    if (results.length === 0) {
      throw new Error('No search results found from any source');
    }
    
    // Limit results to prevent overwhelming the knowledge base
    return results.slice(0, 10);
  }

  /**
   * Parse DuckDuckGo search results from string format
   */
  private parseDuckDuckGoResults(resultsString: string): Array<{title: string, snippet: string, link: string}> {
    // DuckDuckGo results come as formatted text, parse them
    const lines = resultsString.split('\n').filter(line => line.trim());
    const results: Array<{title: string, snippet: string, link: string}> = [];
    
    for (let i = 0; i < lines.length; i += 3) {
      if (i + 2 < lines.length) {
        const title = lines[i].replace(/^title:\s*/i, '').trim();
        const link = lines[i + 1].replace(/^link:\s*/i, '').trim();
        const snippet = lines[i + 2].replace(/^snippet:\s*/i, '').trim();
        
        if (title && link && snippet) {
          results.push({ title, link, snippet });
        }
      }
    }
    
    // If parsing failed, try alternative format
    if (results.length === 0 && resultsString.includes('http')) {
      results.push({
        title: "Search Result",
        snippet: resultsString.substring(0, 200) + "...",
        link: resultsString.match(/https?:\/\/[^\s]+/)?.[0] || "unknown"
      });
    }
    
    // If still no results, throw an error instead of returning fallback
    if (results.length === 0) {
      throw new Error(`Failed to parse DuckDuckGo results: ${resultsString.substring(0, 100)}...`);
    }
    
    return results;
  }
} 