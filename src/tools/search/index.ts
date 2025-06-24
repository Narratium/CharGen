import { BaseRegularTool } from "../base-tool";
import { ToolType, BaseToolContext } from "../../models/agent-model";
import { searchPrompts } from "./prompts";
import { SearchThinking } from "./think";
import { ImprovementInstruction } from "../base-think";

/**
 * Search Tool - Enhanced with thinking capabilities
 * 搜索工具 - 增强思考能力
 */
export class SearchTool extends BaseRegularTool {
  readonly toolType = ToolType.SEARCH;
  readonly name = "Inspiration Seeker";
  readonly description = "Search for inspiration, references, and creative ideas";
  protected thinking: SearchThinking;

  constructor() {
    super();
    this.thinking = new SearchThinking();
  }

  /**
   * Core work logic - search and generate inspiration using intelligent routing
   * 核心工作逻辑 - 使用智能路由搜索并生成灵感
   */
  async doWork(context: BaseToolContext): Promise<any> {
    // Define available sub-tools (currently single, but prepared for future expansion)
    const availableSubTools = [
      "searchAndInspire"
    ];

    try {
      // Use intelligent routing to select the best sub-tool
      console.log(`🧠 [SEARCH] Using intelligent routing to select sub-tool...`);
      const routingDecision = await this.thinking.routeToSubTool(context, availableSubTools);
      
      console.log(`🎯 [SEARCH] Selected sub-tool: ${routingDecision.selected_sub_tool} (confidence: ${routingDecision.confidence}%)`);
      console.log(`📝 [SEARCH] Reasoning: ${routingDecision.reasoning}`);

      // Route to the selected sub-tool
      switch (routingDecision.selected_sub_tool) {
        case "searchAndInspire":
          return await this.performSearchAndInspire(context);
        default:
          // Log unknown sub-tool and throw error instead of fallback
          console.error(`[SEARCH] Unknown sub-tool: ${routingDecision.selected_sub_tool}`);
          throw new Error(`Unknown sub-tool selected: ${routingDecision.selected_sub_tool}`);
      }
    } catch (error) {
      // Log failure and propagate error instead of fallback
      console.error(`[SEARCH] Tool execution failed:`, error);
      throw error; // Re-throw to let base class handle
    }
  }

  /**
   * Main search and inspiration functionality
   * 主要搜索和灵感功能
   */
  private async performSearchAndInspire(context: BaseToolContext): Promise<any> {
    try {
      // Generate search queries using LLM
      const searchQueries = await this.generateSearchQueries(context);
      
      // Perform actual searches
      const searchResults = await this.performSearches(searchQueries);
      
      // Process and analyze results
      const processedResults = await this.processSearchResults(searchResults, context);
      
      const result = {
        queries: searchQueries,
        results: processedResults,
        summary: await this.generateSearchSummary(processedResults, context),
      };

      // Display results to user
      await this.addMessage(
        context.conversation_id,
        "agent",
        `🔍 **Search Complete**\n\n**Queries:** ${searchQueries.join(', ')}\n**Results:** ${processedResults.length} relevant findings\n\n${result.summary}`,
      );

      return result;

    } catch (error) {
      // Log specific failure and throw error instead of fallback
      console.error(`[SEARCH] Search operation failed:`, error);
      throw new Error(`Search operation failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Improvement logic - enhance search results based on feedback
   * 改进逻辑 - 根据反馈增强搜索结果
   */
  async improve(
    currentResult: any,
    instruction: ImprovementInstruction,
    context: BaseToolContext
  ): Promise<any> {
    try {
      console.log(`🔄 [SEARCH] Improving results based on: ${instruction.focus_areas.join(', ')}`);
      
      // Generate improved search based on instruction
      const improvedResult = await this.generateImprovedSearch(
        currentResult,
        instruction,
        context
      );
      
      await this.addMessage(
        context.conversation_id,
        "agent",
        `🔍 **Improved Search Results**\n\n${improvedResult.summary || improvedResult.inspiration}`
      );

      return {
        ...improvedResult,
        improvementApplied: instruction.focus_areas,
        previousResult: currentResult
      };
      
    } catch (error) {
      // Log improvement failure and throw error instead of fallback
      console.error(`[SEARCH] Search improvement failed:`, error);
      throw new Error(`Search improvement failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Generate improved search based on feedback
   */
  private async generateImprovedSearch(
    currentResult: any,
    instruction: ImprovementInstruction,
    context: BaseToolContext
  ): Promise<any> {
    const improvementPrompt = `Improve the search/inspiration based on these instructions:

FOCUS AREAS: ${instruction.focus_areas.join(', ')}
SPECIFIC REQUESTS: ${instruction.specific_requests.join(', ')}
TARGET QUALITY: ${instruction.quality_target}/100

CURRENT RESULT:
${JSON.stringify(currentResult, null, 2)}

Generate improved inspiration content that addresses the feedback above.`;

    const prompt = this.buildContextualPrompt(
      searchPrompts.SUMMARY_GENERATION_SYSTEM + "\n\nYou are improving existing search results based on feedback.",
      improvementPrompt,
      context
    );

    const improvedContent = await this.executeLLMChain(prompt, {
      improvement_context: "Improving search results based on feedback"
    }, context, {
      errorMessage: "Failed to generate improved search content"
    });

    return {
      queries: currentResult.queries || ["improved search"],
      results: currentResult.results || [],
      summary: improvedContent,
      improved: true
    };
  }

  /**
   * Generate intelligent search queries using LLM
   */
  private async generateSearchQueries(context: BaseToolContext): Promise<string[]> {
    const prompt = this.buildContextualPrompt(
      searchPrompts.QUERY_GENERATION_SYSTEM,
      searchPrompts.QUERY_GENERATION_HUMAN,
      context
    );

    try {
      const queries = await this.executeLLMChain(prompt, {
        task_description: "Generate relevant search queries"
      }, context, {
        parseJson: true,
        errorMessage: "Failed to generate search queries"
      });
      if (!Array.isArray(queries)) {
        throw new Error("LLM returned invalid query format - expected array");
      }
      return queries;
    } catch (error) {
      // Don't return fallback values - propagate the error
      throw new Error(`Failed to generate search queries: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Perform actual web searches using DuckDuckGo
   */
  private async performSearches(queries: string[]): Promise<any[]> {
    const results = [];
    
    for (const query of queries.slice(0, 3)) { // Limit to 3 queries to avoid rate limiting
      try {
        const searchResult = await this.searchDuckDuckGo(query);
        if (searchResult) {
          results.push({
            query,
            results: searchResult,
          });
        }
        
        // Add delay between searches
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.warn(`Search failed for query "${query}":`, error);
        // Continue with other queries instead of stopping
      }
    }
    
    return results;
  }

  /**
   * Search using DuckDuckGo Instant Answer API
   */
  private async searchDuckDuckGo(query: string): Promise<any> {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`;
    
    try {
      const response = await fetch(url);
      const data = await response.json() as any;
      
      return {
        abstract: data.Abstract,
        abstractText: data.AbstractText,
        abstractSource: data.AbstractSource,
        abstractURL: data.AbstractURL,
        relatedTopics: data.RelatedTopics?.slice(0, 5) || [],
        answer: data.Answer,
        answerType: data.AnswerType,
        definition: data.Definition,
        definitionSource: data.DefinitionSource,
        definitionURL: data.DefinitionURL,
        entity: data.Entity,
        heading: data.Heading,
        image: data.Image,
        redirect: data.Redirect,
        type: data.Type,
      };
    } catch (error) {
      console.error("DuckDuckGo search failed:", error);
      return null;
    }
  }

  /**
   * Process and analyze search results
   */
  private async processSearchResults(searchResults: any[], context: BaseToolContext): Promise<any[]> {
    const processedResults = [];
    
    for (const searchResult of searchResults) {
      if (searchResult.results) {
        const processed = {
          query: searchResult.query,
          abstract: searchResult.results.abstract,
          abstractText: searchResult.results.abstractText,
          abstractURL: searchResult.results.abstractURL,
          relatedTopics: searchResult.results.relatedTopics?.map((topic: any) => ({
            text: topic.Text,
            firstURL: topic.FirstURL,
          })) || [],
          answer: searchResult.results.answer,
          definition: searchResult.results.definition,
          entity: searchResult.results.entity,
          heading: searchResult.results.heading,
        };
        
        processedResults.push(processed);
      }
    }
    
    return processedResults;
  }

  /**
   * Generate a summary of search results using LLM
   */
  private async generateSearchSummary(results: any[], context: BaseToolContext): Promise<string> {
    if (results.length === 0) {
      throw new Error("No search results to summarize");
    }
    
    const prompt = this.buildContextualPrompt(
      searchPrompts.SUMMARY_GENERATION_SYSTEM,
      searchPrompts.SUMMARY_GENERATION_HUMAN,
      context
    );

    return await this.executeLLMChain(prompt, {
      search_results: JSON.stringify(results, null, 2)
    }, context, {
      errorMessage: "Failed to generate search summary"
    });
  }
} 