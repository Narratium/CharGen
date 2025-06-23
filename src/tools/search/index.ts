import { BaseTool } from "../base-tool";
import { ToolType, ToolExecutionContext, ToolExecutionResult, PlanTask } from "../../models/agent-model";
import { SearchPrompts } from "./prompts";

/**
 * Search Tool - Generate creative inspiration and references
 */
export class SearchTool extends BaseTool {
  readonly toolType = ToolType.SEARCH;
  readonly name = "Inspiration Seeker";
  readonly description = "Search for inspiration, references, and creative ideas";

  async executeToolLogic(task: PlanTask, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    // Generate search queries using LLM
    const searchQueries = await this.generateSearchQueries(task, context);
    
    // Perform actual searches
    const searchResults = await this.performSearches(searchQueries);
    
    // Process and analyze results
    const processedResults = await this.processSearchResults(searchResults, task, context);
    
    await this.addThought(
      context.conversation_id,
      "observation",
      `Found ${processedResults.length} relevant search results`,
      task.id,
    );

    const result = {
      queries: searchQueries,
      results: processedResults,
      summary: await this.generateSearchSummary(processedResults, context, task),
    };

    // Display results to user
    await this.addMessage(
      context.conversation_id,
      "agent",
      `🔍 **Search Complete**\n\n**Queries:** ${searchQueries.join(', ')}\n**Results:** ${processedResults.length} relevant findings\n\n${result.summary}`,
    );

    return this.createSuccessResult(result, {
      reasoning: `Successfully searched and found ${processedResults.length} relevant results`
    });
  }

  /**
   * Generate intelligent search queries using LLM
   */
  private async generateSearchQueries(task: PlanTask, context: ToolExecutionContext): Promise<string[]> {
    const systemPrompt = `You are an expert researcher specializing in character and worldbook creation research.

MISSION: Generate targeted search queries based on comprehensive project status to find exactly what's needed.

RESEARCH STRATEGY:
1. Analyze current results to identify research gaps
2. Focus searches on missing elements or areas needing enhancement
3. Consider user's original vision and current progress
4. Generate queries that will provide actionable creative inspiration
5. Avoid redundant searches for already-covered topics

QUERY TYPES TO CONSIDER:
- Character archetypes and personality psychology (if character needs development)
- World-building elements (if worldbook needs expansion)
- Cultural references and mythology (for authenticity and depth)
- Genre conventions and subversions (for creative direction)
- Historical periods and settings (for accuracy and inspiration)
- Visual and aesthetic references (for vivid descriptions)
- Thematic elements and symbolism (for depth and meaning)

OUTPUT: JSON array of 3-5 specific, targeted search query strings.

CRITICAL: Focus searches on what's actually missing or needs improvement based on current project status.`;

    const prompt = await this.createContextualPrompt(
      systemPrompt,
      `TASK: Generate search queries for "${task.description}"

Based on the comprehensive project status above:
1. What research gaps exist in current results?
2. What aspects need creative inspiration or references?
3. What elements would benefit from real-world grounding?
4. What unexplored areas could enhance the character/world?

Generate specific search queries that will provide valuable information to complete the current task and improve existing work.

Return as JSON array: ["query1", "query2", "query3", ...]`,
      task,
      context
    );

    try {
      const queries = await this.executeLLMChain(prompt, {}, context, {
        parseJson: true,
        errorMessage: "Failed to generate search queries"
      });
      return Array.isArray(queries) ? queries : [task.parameters.query || task.description];
    } catch (error) {
      // Fallback to context-aware basic queries
      const hasCharacter = !!context.current_result.character_data;
      const hasWorldbook = context.current_result.worldbook_data && context.current_result.worldbook_data.length > 0;
      
      const fallbackQueries = [task.parameters.query || task.description];
      
      if (!hasCharacter) {
        fallbackQueries.push(`${context.plan_pool.context.user_request} character archetypes`);
        fallbackQueries.push(`${context.plan_pool.context.user_request} personality types`);
      }
      
      if (!hasWorldbook) {
        fallbackQueries.push(`${context.plan_pool.context.user_request} world building`);
        fallbackQueries.push(`${context.plan_pool.context.user_request} setting inspiration`);
      }
      
      return fallbackQueries;
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
        results.push({
          query,
          results: searchResult,
        });
        
        // Add delay between searches
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Search failed for query "${query}":`, error);
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
  private async processSearchResults(searchResults: any[], task: PlanTask, context: ToolExecutionContext): Promise<any[]> {
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
  private async generateSearchSummary(results: any[], context: ToolExecutionContext, task: PlanTask): Promise<string> {
    if (results.length === 0) {
      // Return fallback inspiration instead
      const userRequest = context.plan_pool.context.user_request;
      const hasCharacter = !!context.current_result.character_data;
      const hasWorldbook = context.current_result.worldbook_data && context.current_result.worldbook_data.length > 0;
      
      return SearchPrompts.generateFallbackInspiration(
        task.description,
        userRequest,
        hasCharacter,
        hasWorldbook || false
      );
    }
    
    const systemPrompt = `You are an expert creative consultant specializing in character and worldbook development.

MISSION: Analyze search results and extract actionable insights that directly support the current project's needs.

ANALYSIS PRINCIPLES:
1. Focus on information that fills gaps in current results
2. Identify concepts that enhance existing character/worldbook elements
3. Extract practical, usable creative inspiration
4. Highlight cultural/historical authenticity sources
5. Suggest specific applications for the findings
6. Connect insights to user's original vision

OUTPUT: Provide a structured, actionable summary that clearly explains how the research can improve the current character and worldbook.`;

    const prompt = await this.createContextualPrompt(
      systemPrompt,
      `SEARCH RESULTS:
${JSON.stringify(results, null, 2)}

Based on the comprehensive project status and search results above:
1. What key insights support the current character/worldbook development?
2. How can these findings address gaps in existing work?
3. What specific creative elements can be incorporated?
4. What cultural or historical authenticity can be added?

Provide a structured summary that explains how to practically apply these research findings to improve the character and worldbook.`,
      task,
      context
    );

    try {
      return await this.executeLLMChain(prompt, {}, context, {
        errorMessage: "Failed to generate search summary"
      });
    } catch (error) {
      // Return fallback inspiration if LLM fails
      const userRequest = context.plan_pool.context.user_request;
      const hasCharacter = !!context.current_result.character_data;
      const hasWorldbook = context.current_result.worldbook_data && context.current_result.worldbook_data.length > 0;
      
      return SearchPrompts.generateFallbackInspiration(
        task.description,
        userRequest,
        hasCharacter,
        hasWorldbook || false
      );
    }
  }
} 