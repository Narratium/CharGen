import { AgentEngine } from "./agent-engine";
import { ResearchSessionOperations } from "../data/agent/agent-conversation-operations";
import { ResearchSession, SessionStatus } from "../models/agent-model";

// Define user input callback type
type UserInputCallback = (message?: string, options?: string[]) => Promise<string>;

/**
 * Agent Service - Simplified for Real-time Decision Architecture
 * High-level API for character+worldbook generation with real-time planning
 */
export class AgentService {
  private engines: Map<string, AgentEngine> = new Map();

  constructor() {
    // Initialize storage on construction
    this.initialize();
  }

  /**
   * Initialize service with storage
   */
  private async initialize(): Promise<void> {
    try {
      const { initializeDataFiles } = await import('../data/local-storage');
      await initializeDataFiles();
    } catch (error) {
      console.error('Failed to initialize AgentService:', error);
    }
  }

  /**
   * Start a new character generation conversation with user input callback
   */
  async startGeneration(
    initialUserRequest: string,
    llmConfig: {
      model_name: string;
      api_key: string;
      base_url?: string;
      llm_type: "openai" | "ollama";
      temperature?: number;
      max_tokens?: number;
      tavily_api_key?: string;
    },
    userInputCallback?: UserInputCallback,
  ): Promise<{
    conversationId: string;
    success: boolean;
    result?: any;
    error?: string;
  }> {
    try {
      // Create new conversation with fixed title and story as user request
      const session = await ResearchSessionOperations.createSession(
        "Character & Worldbook Generation", // Fixed title
        {
          model_name: llmConfig.model_name,
          api_key: llmConfig.api_key,
          base_url: llmConfig.base_url,
          llm_type: llmConfig.llm_type,
          temperature: llmConfig.temperature || 0.7,
          max_tokens: llmConfig.max_tokens,
          tavily_api_key: llmConfig.tavily_api_key,
        },
        initialUserRequest // Story description as user request
      );
      
      // Create agent engine with user input callback
      const engine = new AgentEngine(session.id, userInputCallback);
      this.engines.set(session.id, engine);
      
      // Start execution with callback
      const result = await engine.start(userInputCallback);
      
      return {
        conversationId: session.id,
        success: result.success,
        result: result.result,
        error: result.error,
      };
      
    } catch (error) {
      console.error("Failed to start generation:", error);
      return {
        conversationId: "",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get conversation status and progress with new data structure
   */
  async getSessionStatus(sessionId: string): Promise<{
    session: ResearchSession | null;
    status: SessionStatus;
    progress: {
      completedTasks: number;
      totalIterations: number;
      knowledgeBaseSize: number;
    };
    hasResult: boolean;
    result?: any;
  }> {
    try {
      const session = await ResearchSessionOperations.getSessionById(sessionId);
      if (!session) {
        return {
          session: null,
          status: SessionStatus.FAILED,
          progress: {
            completedTasks: 0,
            totalIterations: 0,
            knowledgeBaseSize: 0,
          },
          hasResult: false,
        };
      }
      
      // Check completion using new character_progress structure
      const hasCharacterData = !!session.generation_output.character_data;
      const hasWorldbookData = !!session.generation_output.worldbook_data && session.generation_output.worldbook_data.length > 0;
      const hasResult = hasCharacterData && hasWorldbookData;
      
      return {
        session: session,
        status: session.status,
        progress: {
          completedTasks: session.research_state.completed_tasks.length,
          totalIterations: session.execution_info.current_iteration,
          knowledgeBaseSize: session.research_state.knowledge_base.length,
        },
        hasResult,
        result: hasResult ? {
          character_data: session.generation_output.character_data,
          worldbook_data: session.generation_output.worldbook_data,
          knowledge_base: session.research_state.knowledge_base,
          completion_status: session
        } : undefined,
      };
      
    } catch (error) {
      console.error("Failed to get conversation status:", error);
      return {
        session: null,
        status: SessionStatus.FAILED,
        progress: {
          completedTasks: 0,
          totalIterations: 0,
          knowledgeBaseSize: 0,
        },
        hasResult: false,
      };
    }
  }

  /**
   * List all conversations for a user
   */
  async listConversations(): Promise<ResearchSession[]> {
    try {
      return await ResearchSessionOperations.getAllSessions();
    } catch (error) {
      console.error("Failed to list conversations:", error);
      return [];
    }
  }

  /**
   * Delete a conversation
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      // Remove engine from memory
      this.engines.delete(sessionId);
      
      // Delete from storage
      await ResearchSessionOperations.deleteSession(sessionId);
      return true;
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      return false;
    }
  }

  /**
   * Clear all sessions from storage and memory
   */
  async clearAllSessions(): Promise<void> {
    try {
      // Clear all engines from memory
      this.engines.clear();
      
      // Clear all sessions from storage
      await ResearchSessionOperations.clearAll();
      console.log('All sessions cleared from storage.');
    } catch (error) {
      console.error("Failed to clear all sessions:", error);
      throw error; // Re-throw to be caught by CLI
    }
  }

  /**
   * Get conversation messages for UI display
   */
  async getMessages(sessionId: string): Promise<{
    messages: any[];
    messageCount: number;
  }> {
    try {
      const session = await ResearchSessionOperations.getSessionById(sessionId);
      if (!session) {
        return {
          messages: [],
          messageCount: 0,
        };
      }
      
      return {
        messages: session.messages,
        messageCount: session.messages.length,
      };
      
    } catch (error) {
      console.error("Failed to get conversation messages:", error);
      return {
        messages: [],
        messageCount: 0,
      };
    }
  }

  /**
   * Get task state for debugging (replaces planning status)
   */
  async getResearchState(sessionId: string): Promise<{
    mainObjective: string;
    completedTasks: string[];
    knowledgeBase: any[];
  }> {
    try {
      const session = await ResearchSessionOperations.getSessionById(sessionId);
      if (!session) {
        return {
          mainObjective: "",
          completedTasks: [],
          knowledgeBase: [],
        };
      }
      
      return {
        mainObjective: session.research_state.main_objective,
        completedTasks: session.research_state.completed_tasks,
        knowledgeBase: session.research_state.knowledge_base,
      };
      
    } catch (error) {
      console.error("Failed to get task state:", error);
      return {
        mainObjective: "",
        completedTasks: [],
        knowledgeBase: [],
      };
    }
  }

  /**
   * Get character progress for UI display
   */
  async getGenerationOutput(sessionId: string): Promise<{
    hasCharacter: boolean;
    hasWorldbook: boolean;
    completionPercentage: number;
    characterData?: any;
    worldbookData?: any[];
  }> {
    try {
      const session = await ResearchSessionOperations.getSessionById(sessionId);
      if (!session) {
        return {
          hasCharacter: false,
          hasWorldbook: false,
          completionPercentage: 0,
        };
      }
      
      const hasCharacter = !!session.generation_output.character_data;
      const hasWorldbook = !!session.generation_output.worldbook_data && session.generation_output.worldbook_data.length > 0;
      
      // Calculate completion percentage from completion status
      const completionPercentage = 0;
      
      return {
        hasCharacter,
        hasWorldbook,
        completionPercentage: Math.round(completionPercentage),
        characterData: session.generation_output.character_data,
        worldbookData: session.generation_output.worldbook_data,
      };
      
    } catch (error) {
      console.error("Failed to get character progress:", error);
      return {
        hasCharacter: false,
        hasWorldbook: false,
        completionPercentage: 0,
      };
    }
  }

  /**
   * Export conversation data
   */
  async exportConversation(sessionId: string): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    try {
      const session = await ResearchSessionOperations.getSessionById(sessionId);
      if (!session) {
        return {
          success: false,
          error: "Conversation not found",
        };
      }
      
      const exportData = {
        session,
        exportedAt: new Date().toISOString(),
        version: "4.0", // Updated to new simplified architecture
        architecture: "real-time-decision",
      };
      
      return {
        success: true,
        data: exportData,
      };
      
    } catch (error) {
      console.error("Failed to export conversation:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get generation statistics with new data structure
   */
  async getGenerationStats(): Promise<{
    totalConversations: number;
    completedGenerations: number;
    successRate: number;
    averageIterations: number;
    statusBreakdown: Record<string, number>;
    averageKnowledgeBaseSize: number;
    averageTokensUsed: number;
  }> {
    try {
      const sessions = await ResearchSessionOperations.getAllSessions();
      
      const statusBreakdown: Record<string, number> = {};
      let totalIterations = 0;
      let completedGenerations = 0;
      let totalKnowledgeBaseSize = 0;
      let totalTokensUsed = 0;
      
      sessions.forEach(session => {
        // Count by status
        statusBreakdown[session.status] = (statusBreakdown[session.status] || 0) + 1;
        
        // Count iterations
        totalIterations += session.execution_info.current_iteration;
        
        // Count tokens used
        totalTokensUsed += session.execution_info.total_tokens_used || 0;
        
        // Count knowledge base size
        totalKnowledgeBaseSize += session.research_state.knowledge_base.length;
        
        // Count completed generations
        if (session.status === SessionStatus.COMPLETED && 
            session.generation_output.character_data && 
            session.generation_output.worldbook_data && 
            session.generation_output.worldbook_data.length > 0) {
          completedGenerations++;
        }
        
       
      });
      
      const successRate = sessions.length > 0 
        ? (completedGenerations / sessions.length) * 100 
        : 0;
        
      const averageIterations = sessions.length > 0 
        ? totalIterations / sessions.length 
        : 0;
        

      const averageKnowledgeBaseSize = sessions.length > 0
        ? totalKnowledgeBaseSize / sessions.length
        : 0;

      const averageTokensUsed = sessions.length > 0
        ? totalTokensUsed / sessions.length
        : 0;
      
      return {
        totalConversations: sessions.length,
        completedGenerations,
        successRate,
        averageIterations,
        statusBreakdown,
        averageKnowledgeBaseSize,
        averageTokensUsed,
      };
      
    } catch (error) {
      console.error("Failed to get generation stats:", error);
      return {
        totalConversations: 0,
        completedGenerations: 0,
        successRate: 0,
        averageIterations: 0,
        statusBreakdown: {},
        averageKnowledgeBaseSize: 0,
        averageTokensUsed: 0,
      };
    }
  }

  /**
   * Get conversation summary for quick display
   */
  async getConversationSummary(sessionId: string): Promise<{
    title: string;
    status: SessionStatus;
    messageCount: number;
    hasCharacter: boolean;
    hasWorldbook: boolean;
    completionPercentage: number;
    knowledgeBaseSize: number;
  } | null> {
    try {
      return await ResearchSessionOperations.getSessionSummary(sessionId);
    } catch (error) {
      console.error("Failed to get conversation summary:", error);
      return null;
    }
  }

  /**
   * Cleanup resources for a conversation
   */
  async cleanup(conversationId: string): Promise<void> {
    this.engines.delete(conversationId);
  }

  /**
   * Get engine for conversation (for advanced usage)
   */
  getEngine(conversationId: string): AgentEngine | undefined {
    return this.engines.get(conversationId);
  }

  /**
   * Generate avatar image with download and file output
   */
  async generateAvatar(conversationId: string): Promise<{
    success: boolean;
    imageDescription?: string;
    imageUrl?: string;
    localImagePath?: string;
    outputFilePath?: string;
    candidateImages?: string[];
    error?: string;
  }> {
    try {
      // Get the session data
      const session = await ResearchSessionOperations.getSessionById(conversationId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      const characterData = session.generation_output.character_data;
      const worldbookData = session.generation_output.worldbook_data;

      if (!characterData) {
        return { success: false, error: 'No character data found for avatar generation' };
      }

      let selectedImageUrl: string;
      let imageDescription: string = '';
      let candidateImages: string[] = [];

      // Check if character already has an avatar URL (resume mode)
      if (characterData.avatar && this.isValidImageUrl(characterData.avatar)) {
        selectedImageUrl = characterData.avatar;
        imageDescription = 'Using existing avatar URL from character data';
      } else {
        // Step 1: Generate image description
        imageDescription = await this.generateImageDescription(characterData, worldbookData || [], session.llm_config);
        
        // Step 2: Search for images
        const imageResults = await this.searchImages(imageDescription, session.llm_config.tavily_api_key || '');
        
        if (!imageResults.success || !imageResults.images || imageResults.images.length === 0) {
          return { 
            success: false, 
            error: imageResults.error || 'No images found',
            imageDescription 
          };
        }

        candidateImages = imageResults.images;

        // Step 3: Select best image
        const selectedUrl = await this.selectBestImage(imageResults.images, imageDescription, session.llm_config, characterData);
        
        if (!selectedUrl) {
          return { 
            success: false, 
            error: 'No suitable image could be selected',
            imageDescription,
            candidateImages: candidateImages
          };
        }
        
        selectedImageUrl = selectedUrl;
      }

      // Step 4: Download image and convert to PNG
      const downloadResult = await this.downloadAndConvertImage(selectedImageUrl, characterData.name || 'character');
      
      if (!downloadResult.success) {
        return {
          success: false,
          error: downloadResult.error,
          imageDescription,
          imageUrl: selectedImageUrl,
          candidateImages: candidateImages
        };
      }

      // Step 5: Update character data with local image path
      await ResearchSessionOperations.updateGenerationOutput(conversationId, {
        character_data: {
          ...characterData,
          avatar: downloadResult.localPath
        }
      });

      // Step 6: Generate standard format and embed in PNG
      const outputResult = await this.generateStandardFormatFile(conversationId, downloadResult.localPath || '');
      
      // Step 7: Embed JSON data into PNG metadata
      if (outputResult.success && outputResult.standardFormat && downloadResult.localPath) {
        await this.embedJsonInPng(downloadResult.localPath, outputResult.standardFormat);
      }

      return {
        success: true,
        imageDescription,
        imageUrl: selectedImageUrl,
        localImagePath: downloadResult.localPath,
        outputFilePath: outputResult.outputPath,
        candidateImages: candidateImages
      };

    } catch (error) {
      console.error('Avatar generation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during avatar generation'
      };
    }
  }

  /**
   * Download image and convert to PNG format
   */
  private async downloadAndConvertImage(imageUrl: string, characterName: string): Promise<{
    success: boolean;
    localPath?: string;
    error?: string;
  }> {
    try {
      const fs = await import('fs-extra');
      const path = await import('path');
      const { default: sharp } = await import('sharp');
      
      // Create images directory in output folder
      const outputDir = path.join(process.cwd(), 'output');
      const imagesDir = path.join(outputDir, 'images');
      await fs.ensureDir(imagesDir);

      // Generate safe filename
      const safeFileName = characterName.replace(/[^a-zA-Z0-9\-_]/g, '_').toLowerCase();
      const outputPath = path.join(imagesDir, `${safeFileName}.png`);

      // Download image
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }

      const imageBuffer = Buffer.from(await response.arrayBuffer());
      
      // Convert to PNG using Sharp
      // 1:0.7 ratio (height:width) - portrait orientation
      const width = 512;
      const height = Math.round(width / 0.7); // 731 pixels
      
      await sharp(imageBuffer)
        .png({
          quality: 90,
          compressionLevel: 6
        })
        .resize(width, height, {
          fit: 'cover',
          position: 'center'
        })
        .toFile(outputPath);

      // Return relative path for storage
      const relativePath = path.relative(process.cwd(), outputPath);
      
      return {
        success: true,
        localPath: relativePath
      };

    } catch (error) {
      console.error('Image download/conversion failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during image processing'
      };
    }
  }

  /**
   * Generate standard format character card file
   */
  private async generateStandardFormatFile(conversationId: string, imagePath: string): Promise<{
    success: boolean;
    outputPath?: string;
    standardFormat?: any;
    error?: string;
  }> {
    try {
      const fs = await import('fs-extra');
      const path = await import('path');

      // Get session data
      const session = await ResearchSessionOperations.getSessionById(conversationId);
      if (!session) {
        throw new Error('Session not found');
      }

      const characterData = session.generation_output.character_data;
      const worldbookData = session.generation_output.worldbook_data || [];

      if (!characterData) {
        throw new Error('No character data found');
      }

      // Build character book entries from worldbook data
      const characterBookEntries = worldbookData.map((entry, index) => ({
        comment: entry.comment,
        content: entry.content,
        disable: entry.disable,
        position: entry.position,
        constant: entry.constant,
        key: entry.key,
        order: entry.order || index + 1,
        depth: 4 // Default depth
      }));

      // Create standard format
      const standardFormat = {
        spec: "chara_card_v3",
        spec_version: "3.0",
        data: {
          name: characterData.name,
          description: characterData.description,
          personality: characterData.personality,
          first_mes: characterData.first_mes,
          scenario: characterData.scenario,
          mes_example: characterData.mes_example,
          creator_notes: characterData.creator_notes,
          // Only include fields that exist
          ...(characterData.system_prompt && { system_prompt: characterData.system_prompt }),
          ...(characterData.post_history_instructions && { post_history_instructions: characterData.post_history_instructions }),
          ...(characterData.tags && { tags: characterData.tags }),
          ...(characterData.creator && { creator: characterData.creator }),
          ...(characterData.character_version && { character_version: characterData.character_version }),
          ...(characterData.alternate_greetings && { alternate_greetings: characterData.alternate_greetings }),
          // Add character book if worldbook exists
          ...(characterBookEntries.length > 0 && {
            character_book: {
              entries: characterBookEntries
            }
          })
        }
      };

      // Generate output file path
      const outputDir = path.join(process.cwd(), 'output');
      const safeFileName = (characterData.name || 'character').replace(/[^a-zA-Z0-9\-_]/g, '_').toLowerCase();
      const outputPath = path.join(outputDir, `${safeFileName}_card.json`);

      // Write file
      await fs.writeJson(outputPath, standardFormat, { spaces: 2 });

      return {
        success: true,
        outputPath: path.relative(process.cwd(), outputPath),
        standardFormat: standardFormat
      };

    } catch (error) {
      console.error('Standard format file generation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during file generation'
      };
    }
  }

  /**
   * Generate precise image description based on character and worldbook data
   */
  private async generateImageDescription(characterData: any, worldbookData: any[], llmConfig: any): Promise<string> {
    const { ChatOpenAI } = await import("@langchain/openai");
    const { ChatOllama } = await import("@langchain/ollama");
    const { ChatPromptTemplate } = await import("@langchain/core/prompts");

    // Create LLM instance
    let model: any;
    if (llmConfig.llm_type === "openai") {
      model = new ChatOpenAI({
        apiKey: llmConfig.api_key,
        modelName: llmConfig.model_name,
        temperature: 0.7,
        maxTokens: 500,
        ...(llmConfig.base_url && { configuration: { baseURL: llmConfig.base_url } })
      });
    } else {
      model = new ChatOllama({
        baseUrl: llmConfig.base_url || "http://localhost:11434",
        model: llmConfig.model_name,
        temperature: 0.7,
      });
    }

    const prompt = ChatPromptTemplate.fromTemplate(`
You are an expert at creating concise image search queries for character cards and story scenarios.

CHARACTER DATA:
{characterData}

WORLDBOOK DATA:
{worldbookData}

TASK: Create ONE precise sentence that describes the ideal image for this character/story.

REQUIREMENTS:
1. Maximum 30 words
2. Focus on key visual elements: art style, main subject, setting
3. Include genre/style (anime, realistic, fantasy art, etc.)
4. No explanations, no formatting, just the search phrase

EXAMPLES:
- "Anime portrait of silver-haired mage girl in magical academy uniform"
- "Fantasy artwork of cyberpunk detective in neon-lit city streets"
- "Realistic painting of medieval knight in dark forest setting"

Generate ONE concise image search sentence:`);

    const response = await model.invoke([
      await prompt.format({
        characterData: JSON.stringify(characterData, null, 2),
        worldbookData: JSON.stringify(worldbookData, null, 2)
      }),
    ]);

    // Clean and validate the response
    let cleanDescription = response.content as string;
    
    // Basic cleanup for concise response
    cleanDescription = cleanDescription.replace(/[""]/g, '"'); // Normalize quotes
    cleanDescription = cleanDescription.replace(/^["']|["']$/g, ''); // Remove surrounding quotes
    cleanDescription = cleanDescription.replace(/\s+/g, ' ').trim(); // Normalize whitespace
    
    // Ensure it's a reasonable length (fallback if LLM ignores word limit)
    if (cleanDescription.length > 150) {
      const words = cleanDescription.split(' ');
      cleanDescription = words.slice(0, 30).join(' ');
    }
    
    return cleanDescription;
  }

  /**
   * Search for images using Tavily API
   */
  private async searchImages(description: string, tavilyApiKey: string): Promise<{
    success: boolean;
    images?: string[];
    error?: string;
  }> {
    const { TavilySearch } = await import("@langchain/tavily");
    
    try {
      // Validate and clean the description before sending
      if (!description || description.trim().length === 0) {
        console.error("❌ Empty image description");
        return { success: false, error: "Empty image description" };
      }

      const tavilySearch = new TavilySearch({
        tavilyApiKey: tavilyApiKey,
        maxResults: 8,
        topic: "general",
        includeAnswer: false,
        includeRawContent: false,
        includeImages: true, // This is the key parameter for image search
        searchDepth: "basic", // Use basic search for more reliable results
      });

      // Set API key via environment variable
      process.env.TAVILY_API_KEY = tavilyApiKey;
      
      console.log(`🖼️ Searching for images with clean description: "${description}"`);
      
      const searchResult = await tavilySearch.invoke({ query: description });
      const searchData = typeof searchResult === 'string' ? JSON.parse(searchResult) : searchResult;
      
      // Extract image URLs from the results
      const imageUrls: string[] = [];
      
      // Check if images are returned directly
      if (searchData.images && Array.isArray(searchData.images)) {
        imageUrls.push(...searchData.images.filter((url: string) => this.isValidSearchImageUrl(url)));
      }
      
      // Also check for images in regular results
      if (searchData.results && Array.isArray(searchData.results)) {
        searchData.results.forEach((result: any) => {
          if (result.images && Array.isArray(result.images)) {
            imageUrls.push(...result.images.filter((url: string) => this.isValidSearchImageUrl(url)));
          }
        });
      }
      
      console.log(`✅ Found ${imageUrls.length} candidate images`);
      return {
        success: true,
        images: imageUrls.slice(0, 8), // Return top 8 images
      };
      
    } catch (error: any) {
      console.error("❌ Image search failed:");
      
      // Enhanced error logging for debugging
      if (error.response) {
        console.error(`HTTP ${error.response.status}: ${error.response.statusText}`);
        if (error.response.data) {
          console.error("Response data:", error.response.data);
        }
      } else if (error.message) {
        console.error("Error message:", error.message);
      } else {
        console.error("Unknown error:", error);
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Check if a URL is a valid image URL (simple validation)
   */
  private isValidImageUrl(url: string): boolean {
    return Boolean(url && typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://')));
  }

  /**
   * Validate image URL format and filter out unwanted sources (for search results)
   */
  private isValidSearchImageUrl(url: string): boolean {
    // Basic URL validation
    if (!url || typeof url !== 'string') return false;
    
    // Check for image file extensions
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    const hasValidExtension = imageExtensions.some(ext => url.toLowerCase().includes(ext));
    
    // Check for common image hosting domains
    const validDomains = [
      'imgur.com', 'pixiv.net', 'deviantart.com', 'artstation.com',
      'pinterest.com', 'flickr.com', 'wikimedia.org', 'githubusercontent.com'
    ];
    const hasValidDomain = validDomains.some(domain => url.includes(domain));
    
    // Filter out ad domains and low-quality sources
    const adDomains = [
      'googleadservices.com', 'doubleclick.net', 'googlesyndication.com',
      'amazon-adsystem.com', 'adsystem.amazon', 'googletagmanager.com'
    ];
    const hasAdDomain = adDomains.some(domain => url.includes(domain));
    
    return (hasValidExtension || hasValidDomain) && !hasAdDomain;
  }

  /**
   * Use LLM to select the best image from search results
   */
  private async selectBestImage(imageUrls: string[], description: string, llmConfig: any, characterData: any): Promise<string | null> {
    if (imageUrls.length === 0) return null;
    
    const { ChatOpenAI } = await import("@langchain/openai");
    const { ChatOllama } = await import("@langchain/ollama");
    const { ChatPromptTemplate } = await import("@langchain/core/prompts");

    // Create LLM instance
    let model: any;
    if (llmConfig.llm_type === "openai") {
      model = new ChatOpenAI({
        apiKey: llmConfig.api_key,
        modelName: llmConfig.model_name,
        temperature: 0.3,
        maxTokens: 200,
        ...(llmConfig.base_url && { configuration: { baseURL: llmConfig.base_url } })
      });
    } else {
      model = new ChatOllama({
        baseUrl: llmConfig.base_url || "http://localhost:11434",
        model: llmConfig.model_name,
        temperature: 0.3,
      });
    }

    const prompt = ChatPromptTemplate.fromTemplate(`
You are an image quality expert selecting the best avatar image for a character card.

DESIRED IMAGE DESCRIPTION:
{description}

CHARACTER INFO:
{characterName}: {characterTags}

CANDIDATE IMAGE URLS:
{imageUrls}

SELECTION CRITERIA:
1. Quality: High resolution, clear, professional artwork
2. Relevance: Matches the character/story description and genre
3. Appropriateness: SFW, no watermarks, no text overlays
4. Source reliability: Prefer art sites over generic hosting
5. Style consistency: Matches the expected art style (anime, realistic, etc.)

TASK: Select the SINGLE best image URL from the candidates. Consider the domain reputation and file path quality.

Respond with only the selected URL, nothing else:`);

    try {
      const response = await model.invoke([
        await prompt.format({
          description: description,
          characterName: characterData?.name || 'Character',
          characterTags: characterData?.tags?.join(', ') || 'No tags',
          imageUrls: imageUrls.slice(0, 8).map((url, index) => `${index + 1}. ${url}`).join('\n')
        }),
      ]);

      const selectedUrl = (response.content as string).trim();
      
      // Validate that the selected URL is actually from our candidates
      if (imageUrls.includes(selectedUrl)) {
        console.log(`✅ Selected image: ${selectedUrl}`);
        return selectedUrl;
      } else {
        console.log(`⚠️ LLM selected invalid URL, using first candidate`);
        return imageUrls[0];
      }
      
    } catch (error) {
      console.error("❌ Image selection failed:", error);
      return imageUrls[0]; // Fallback to first image
    }
  }

  /**
   * Resume a previous session based on its current state
   * - If incomplete: continue the generation process
   * - If complete but no avatar: offer avatar generation
   * - If complete with avatar: show completion status
   */
  async resumeSession(
    sessionId: string,
    userInputCallback?: UserInputCallback,
  ): Promise<{
    success: boolean;
    action: 'continued' | 'avatar_generated' | 'already_complete';
    result?: any;
    error?: string;
  }> {
    try {
      // Get the existing session
      const session = await ResearchSessionOperations.getSessionById(sessionId);
      if (!session) {
        return {
          success: false,
          action: 'continued',
          error: 'Session not found'
        };
      }

      // Check session status and determine action needed
      const sessionAnalysis = await this.analyzeSessionForResume(session);
      
      switch (sessionAnalysis.action) {
        case 'continue_generation':
          return await this.continueGeneration(session, userInputCallback);
          
        case 'generate_avatar':
          return await this.generateAvatarForSession(session);
          
        case 'already_complete':
          return {
            success: true,
            action: 'already_complete',
            result: {
              character_data: session.generation_output.character_data,
              worldbook_data: session.generation_output.worldbook_data,
              hasAvatar: !!session.generation_output.character_data?.avatar
            }
          };
          
        default:
          return {
            success: false,
            action: 'continued',
            error: 'Unable to determine resume action'
          };
      }
      
    } catch (error) {
      console.error("Failed to resume session:", error);
      return {
        success: false,
        action: 'continued',
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Analyze session to determine what action is needed for resume
   */
  private async analyzeSessionForResume(session: ResearchSession): Promise<{
    action: 'continue_generation' | 'generate_avatar' | 'already_complete';
    reason: string;
  }> {
    // Check if generation is incomplete
    if (session.status !== SessionStatus.COMPLETED) {
      return {
        action: 'continue_generation',
        reason: `Session status is ${session.status}, needs to continue generation`
      };
    }

    // Check if character generation is incomplete
    const characterData = session.generation_output.character_data;
    const hasCompleteCharacter = this.isCharacterDataComplete(characterData);
    if (!hasCompleteCharacter) {
      return {
        action: 'continue_generation',
        reason: 'Character data is incomplete'
      };
    }

    // Check if avatar is missing or local file doesn't exist
    const avatar = session.generation_output.character_data?.avatar;
    if (!avatar) {
      return {
        action: 'generate_avatar',
        reason: 'Character is complete but missing avatar'
      };
    }
    
    // Check if local image file exists
    const hasLocalImage = await this.checkLocalImageExists(characterData?.name || 'character');
    if (!hasLocalImage) {
      return {
        action: 'generate_avatar',
        reason: 'Character has avatar URL but local image file not found'
      };
    }

    // Everything is complete
    return {
      action: 'already_complete',
      reason: 'Session is fully complete with avatar'
    };
  }

  /**
   * Continue an incomplete generation session
   */
  private async continueGeneration(
    session: ResearchSession,
    userInputCallback?: UserInputCallback
  ): Promise<{
    success: boolean;
    action: 'continued';
    result?: any;
    error?: string;
  }> {
    try {
      // Create or reuse agent engine
      let engine = this.engines.get(session.id);
      if (!engine) {
        engine = new AgentEngine(session.id, userInputCallback);
        this.engines.set(session.id, engine);
      }

      // Update session status to indicate resumption
      await ResearchSessionOperations.updateStatus(session.id, SessionStatus.THINKING);

      // Resume execution
      const result = await engine.start(userInputCallback);

      return {
        success: result.success,
        action: 'continued',
        result: result.result,
        error: result.error,
      };

    } catch (error) {
      return {
        success: false,
        action: 'continued',
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Generate avatar for a complete session
   */
  private async generateAvatarForSession(session: ResearchSession): Promise<{
    success: boolean;
    action: 'avatar_generated';
    result?: any;
    error?: string;
  }> {
    try {
      const avatarResult = await this.generateAvatar(session.id);
      
      return {
        success: avatarResult.success,
        action: 'avatar_generated',
        result: avatarResult,
        error: avatarResult.error
      };

    } catch (error) {
      return {
        success: false,
        action: 'avatar_generated',
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  /**
   * Embed JSON character data into PNG tEXt chunks (compatible with character card readers)
   */
  private async embedJsonInPng(imagePath: string, characterData: any): Promise<void> {
    try {
      const fs = await import('fs-extra');
      const path = await import('path');
      
      const fullImagePath = path.resolve(imagePath);
      
      // Convert character data to base64 encoded JSON
      const jsonString = JSON.stringify(characterData);
      const base64Data = Buffer.from(jsonString, 'utf8').toString('base64');
      
      // Read the existing PNG file
      const pngBuffer = await fs.readFile(fullImagePath);
      
      // Create tEXt chunk with 'chara' keyword
      const textChunk = this.createPngTextChunk('chara', base64Data);
      
      // Insert the tEXt chunk into PNG
      const modifiedPng = this.insertTextChunkIntoPng(pngBuffer, textChunk);
      
      // Write the modified PNG back to file
      await fs.writeFile(fullImagePath, modifiedPng);
        
      console.log(`✅ Embedded character data into PNG tEXt chunk: ${imagePath}`);
      
    } catch (error) {
      console.error('❌ Failed to embed JSON in PNG:', error);
      // Don't throw error - file generation should still succeed
    }
  }

  /**
   * Create PNG tEXt chunk with keyword and text
   */
  private createPngTextChunk(keyword: string, text: string): Buffer {
    const keywordBuffer = Buffer.from(keyword, 'latin1');
    const textBuffer = Buffer.from(text, 'latin1');
    const dataBuffer = Buffer.concat([keywordBuffer, Buffer.from([0]), textBuffer]);
    
    // Calculate CRC32 for the chunk
    const crc32 = this.calculateCRC32(Buffer.concat([Buffer.from('tEXt'), dataBuffer]));
    
    // Create chunk: length + type + data + crc
    const lengthBuffer = Buffer.allocUnsafe(4);
    lengthBuffer.writeUInt32BE(dataBuffer.length, 0);
    
    const crcBuffer = Buffer.allocUnsafe(4);
    crcBuffer.writeUInt32BE(crc32, 0);
    
    return Buffer.concat([
      lengthBuffer,
      Buffer.from('tEXt'),
      dataBuffer,
      crcBuffer
    ]);
  }

  /**
   * Insert tEXt chunk into PNG buffer
   */
  private insertTextChunkIntoPng(pngBuffer: Buffer, textChunk: Buffer): Buffer {
    // PNG signature
    const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    
    // Find IHDR chunk (should be first chunk after signature)
    let offset = pngSignature.length;
    const ihdrLength = pngBuffer.readUInt32BE(offset);
    const ihdrChunk = pngBuffer.slice(offset, offset + 8 + ihdrLength + 4); // length + type + data + crc
    offset += 8 + ihdrLength + 4;
    
    // Insert our tEXt chunk after IHDR, before other chunks
    const beforeChunks = pngBuffer.slice(0, offset);
    const afterChunks = pngBuffer.slice(offset);
    
    return Buffer.concat([beforeChunks, textChunk, afterChunks]);
  }

  /**
   * Simple CRC32 calculation for PNG chunks
   */
  private calculateCRC32(data: Buffer): number {
    const crcTable = this.makeCRCTable();
    let crc = 0xFFFFFFFF;
    
    for (let i = 0; i < data.length; i++) {
      crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
    }
    
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  /**
   * Generate CRC32 lookup table
   */
  private makeCRCTable(): number[] {
    const crcTable: number[] = [];
    
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
      }
      crcTable[n] = c;
    }
    
    return crcTable;
  }

  /**
   * Check if local image file exists for the character
   */
  private async checkLocalImageExists(characterName: string): Promise<boolean> {
    try {
      const fs = await import('fs-extra');
      const path = await import('path');
      
      const safeFileName = (characterName || 'character').replace(/[^a-zA-Z0-9\-_]/g, '_').toLowerCase();
      const imagePath = path.join(process.cwd(), 'output', 'images', `${safeFileName}.png`);
      
      return await fs.pathExists(imagePath);
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if character data has all required fields
   */
  private isCharacterDataComplete(characterData?: any): boolean {
    if (!characterData) return false;

    const requiredFields = [
      'name', 'description', 'personality', 'scenario', 
      'first_mes', 'mes_example', 'creator_notes', 'tags', 'alternate_greetings'
    ];

    return requiredFields.every(field => {
      const value = characterData[field];
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return value && typeof value === 'string' && value.trim().length > 0;
    });
  }
}

// Singleton instance
export const agentService = new AgentService(); 
 
