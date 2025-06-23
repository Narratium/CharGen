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

  private thinking: SearchThinking;

  constructor() {
    super();
    this.thinking = new SearchThinking();
  }

  /**
   * Core work logic - search and generate inspiration
   * 核心工作逻辑 - 搜索并生成灵感
   */
  async doWork(context: BaseToolContext): Promise<any> {
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
      // If search completely fails, provide fallback inspiration
      console.warn("Search failed, using fallback inspiration:", error);
      
      const fallbackInspiration = this.generateFallbackInspiration(context);

      await this.addMessage(
        context.conversation_id,
        "agent",
        `🔍 **Creative Inspiration** (Network issues, using built-in inspiration)\n\n${fallbackInspiration}`,
      );

      return { 
        inspiration: fallbackInspiration,
        fallback: true,
        error: error instanceof Error ? error.message : String(error)
      };
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
      console.warn(`[SEARCH] Improvement failed, using original result:`, error);
      return currentResult; // Return original if improvement fails
    }
  }

  /**
   * Implement thinking capabilities using public methods
   */
  async evaluate(result: any, context: BaseToolContext, attempt: number = 1) {
    return await this.thinking.evaluateResult(result, context, attempt);
  }

  async generateImprovement(result: any, evaluation: any, context: BaseToolContext) {
    return await this.thinking.generateImprovementInstruction(result, evaluation, context);
  }

  protected buildEvaluationPrompt = () => { throw new Error("Use evaluate() instead"); };
  protected buildImprovementPrompt = () => { throw new Error("Use generateImprovement() instead"); };
  protected executeThinkingChain = () => { throw new Error("Use thinking methods directly"); };

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
      return Array.isArray(queries) ? queries : ["character inspiration", "worldbook ideas"];
    } catch (error) {
      // Fallback to context-aware basic queries
      return this.generateFallbackQueries(context);
    }
  }

  /**
   * Generate fallback queries based on current context
   */
  private generateFallbackQueries(context: BaseToolContext): string[] {
    const hasCharacter = !!context.task_progress.character_data;
    const hasWorldbook = !!context.task_progress.worldbook_data && context.task_progress.worldbook_data.length > 0;
    
    // Extract original user request from conversation history
    const userMessages = context.conversation_history.filter(msg => msg.role === "user");
    const originalRequest = userMessages[0]?.content || "character and worldbook generation";
    
    const fallbackQueries = ["creative inspiration"];
    
    if (!hasCharacter) {
      fallbackQueries.push(`${originalRequest} character archetypes`);
      fallbackQueries.push(`${originalRequest} personality types`);
    }
    
    if (!hasWorldbook) {
      fallbackQueries.push(`${originalRequest} world building`);
      fallbackQueries.push(`${originalRequest} setting inspiration`);
    }
    
    return fallbackQueries;
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
      return this.generateFallbackInspiration(context);
    }
    
    const prompt = this.buildContextualPrompt(
      searchPrompts.SUMMARY_GENERATION_SYSTEM,
      searchPrompts.SUMMARY_GENERATION_HUMAN,
      context
    );

    try {
      return await this.executeLLMChain(prompt, {
        search_results: JSON.stringify(results, null, 2)
      }, context, {
        errorMessage: "Failed to generate search summary"
      });
    } catch (error) {
      return this.generateFallbackInspiration(context);
    }
  }

  /**
   * Generate fallback inspiration when search fails
   */
  private generateFallbackInspiration(context: BaseToolContext): string {
    const hasCharacter = !!context.task_progress.character_data;
    const hasWorldbook = !!context.task_progress.worldbook_data && context.task_progress.worldbook_data.length > 0;
    
    // Extract user preferences from conversation history
    const userMessages = context.conversation_history.filter(msg => msg.role === "user");
    const originalRequest = userMessages[0]?.content || "";
    
    let inspiration = "**Creative Inspiration & Ideas:**\n\n";
    
    // Character inspiration
    if (!hasCharacter) {
      inspiration += "**Character Development Ideas:**\n";
      inspiration += "• Consider classic archetypes: The Hero, The Mentor, The Trickster, The Outsider\n";
      inspiration += "• Think about contrasts: A gentle giant, a fierce protector with a soft heart\n";
      inspiration += "• Add unique quirks: specific habits, speech patterns, or beliefs\n";
      inspiration += "• Consider their flaws: what makes them human and relatable?\n\n";
    }
    
    // Worldbook inspiration  
    if (!hasWorldbook) {
      inspiration += "**World Building Ideas:**\n";
      inspiration += "• Draw from real cultures and histories for authenticity\n";
      inspiration += "• Create interesting contrasts: modern tech in ancient settings\n";
      inspiration += "• Think about daily life: what do people eat, how do they travel?\n";
      inspiration += "• Consider conflicts: political tensions, resource scarcity, cultural clashes\n\n";
    }
    
    // General creative techniques
    inspiration += "**Creative Techniques:**\n";
    inspiration += "• Ask 'What if?' questions to explore possibilities\n";
    inspiration += "• Combine unexpected elements for originality\n";
    inspiration += "• Consider the five senses: how does your world feel, smell, sound?\n";
    inspiration += "• Think about emotional resonance: what feelings do you want to evoke?\n\n";
    
    // Context-specific suggestions
    if (originalRequest.toLowerCase().includes("fantasy")) {
      inspiration += "**Fantasy Elements:**\n";
      inspiration += "• Magic systems: cost, rules, limitations\n";
      inspiration += "• Mythical creatures: roles, intelligence, relationships with humans\n";
      inspiration += "• Ancient mysteries: lost civilizations, forgotten knowledge\n\n";
    } else if (originalRequest.toLowerCase().includes("sci-fi") || originalRequest.toLowerCase().includes("science fiction")) {
      inspiration += "**Sci-Fi Elements:**\n";
      inspiration += "• Technology implications: how does it change society?\n";
      inspiration += "• Future evolution: where is humanity heading?\n";
      inspiration += "• Ethical dilemmas: AI rights, genetic modification, space colonization\n\n";
    }
    
    inspiration += "💡 *Remember: The best characters and worlds feel lived-in and real, even in fantastic settings!*";
    
    return inspiration;
  }
} 