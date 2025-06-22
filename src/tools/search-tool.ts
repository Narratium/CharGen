import { BaseTool } from "./base-tool";
import { ToolType, ToolExecutionContext, ToolExecutionResult, PlanTask } from "../models/agent-model";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

/**
 * Search Tool - Real search functionality using DuckDuckGo and web scraping
 */
export class SearchTool extends BaseTool {
  readonly toolType = ToolType.SEARCH;
  readonly name = "Search Engine";
  readonly description = "Search for inspiration, references, and creative ideas using real search engines";

  async executeTask(task: PlanTask, context: ToolExecutionContext): Promise<ToolExecutionResult> {
    await this.addThought(
      context.conversation_id,
      "reasoning",
      `Searching for: ${task.parameters.query || task.description}`,
      task.id,
    );

    try {
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

      return {
        success: true,
        result: {
          queries: searchQueries,
          results: processedResults,
          summary: await this.generateSearchSummary(processedResults, context),
        },
        should_continue: true,
      };
    } catch (error) {
      console.error("Search failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Search failed",
        should_continue: true,
      };
    }
  }

  /**
   * Generate intelligent search queries using LLM
   */
  private async generateSearchQueries(task: PlanTask, context: ToolExecutionContext): Promise<string[]> {
    const llm = this.createLLM(context.llm_config);
    
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", `You are an expert researcher. Generate 3-5 specific search queries to find relevant information for character and worldbook creation.

Focus on:
- Character archetypes and personality types
- World-building elements and settings
- Cultural references and mythology
- Genre-specific tropes and conventions
- Historical periods and events
- Creative inspiration sources

Return as JSON array of strings.`],
      ["human", `User request: ${context.plan_pool.context.user_request}
Task: ${task.description}
Parameters: ${JSON.stringify(task.parameters)}

Generate search queries that will help create this character and world.`],
    ]);

    try {
      const chain = prompt.pipe(llm).pipe(new StringOutputParser());
      const response = await chain.invoke({});
      const cleanedResponse = this.extractJsonFromResponse(response);
      const queries = JSON.parse(cleanedResponse);
      return Array.isArray(queries) ? queries : [task.parameters.query || task.description];
    } catch (error) {
      // Fallback to basic queries
      return [
        task.parameters.query || task.description,
        `${context.plan_pool.context.user_request} character archetypes`,
        `${context.plan_pool.context.user_request} world building`,
      ];
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
  private async generateSearchSummary(results: any[], context: ToolExecutionContext): Promise<string> {
    if (results.length === 0) {
      return "No relevant search results found.";
    }

    const llm = this.createLLM(context.llm_config);
    
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", `You are an expert researcher. Analyze the search results and provide a concise summary of the most relevant information for character and worldbook creation.

Focus on:
- Key insights and inspiration
- Relevant cultural or historical references
- Character archetypes and personality traits
- World-building elements and settings
- Creative ideas and themes

Keep the summary concise but informative.`],
      ["human", `Search results: ${JSON.stringify(results, null, 2)}

User request: ${context.plan_pool.context.user_request}

Provide a summary of the most relevant findings for character and worldbook creation.`],
    ]);

    try {
      const chain = prompt.pipe(llm).pipe(new StringOutputParser());
      const summary = await chain.invoke({});
      return summary;
    } catch (error) {
      return "Search completed but failed to generate summary.";
    }
  }

  /**
   * Extract JSON from response that might contain markdown code blocks
   */
  private extractJsonFromResponse(response: string): string {
    // Remove markdown code blocks if present
    let cleaned = response.trim();
    
    // Remove ```json and ``` if present
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    
    // Find JSON boundaries
    const jsonStart = Math.max(cleaned.indexOf('{'), cleaned.indexOf('['));
    const jsonEnd = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']')) + 1;
    
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      cleaned = cleaned.substring(jsonStart, jsonEnd);
    }
    
    return cleaned.trim();
  }
} 
 
