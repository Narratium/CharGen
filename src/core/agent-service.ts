import { AgentEngine } from "./agent-engine";
import { ResearchSessionOperations } from "../data/agent/agent-conversation-operations";
import { ResearchSession, SessionStatus } from "../models/agent-model";
import { ConfigManager } from "./config-manager";

// Define user input callback type
type UserInputCallback = (message?: string, options?: string[]) => Promise<string>;

/**
 * Agent Service - Simplified for Real-time Decision Architecture
 * High-level API for character+worldbook generation with real-time planning
 */
export class AgentService {
  private engines: Map<string, AgentEngine> = new Map();
  private configManager: ConfigManager;

  constructor() {
    this.configManager = ConfigManager.getInstance();
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
    userInputCallback?: UserInputCallback,
  ): Promise<{
    conversationId: string;
    success: boolean;
    result?: any;
    error?: string;
  }> {
    try {
      // Ensure ConfigManager is initialized
      if (!this.configManager.isConfigured()) {
        await this.configManager.initialize();
      }

      // Check if LLM configuration is available
      if (!this.configManager.isConfigured()) {
        return {
          conversationId: "",
          success: false,
          error: "LLM configuration not found. Please run configuration setup first.",
        };
      }

      // Create new conversation with fixed title and story as user request
      const session = await ResearchSessionOperations.createSession(
        "Character & Worldbook Generation", // Fixed title
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
      // Check if all mandatory worldbook components exist and supplement_data has content (at least 5 valid entries)
      const hasAllWorldbookComponents = !!session.generation_output.status_data && 
                                      !!session.generation_output.user_setting_data && 
                                      !!session.generation_output.world_view_data && 
                                      (session.generation_output.supplement_data && session.generation_output.supplement_data.filter(e => e.content && e.content.trim() !== '').length >= 5);
      
      const hasResult = hasCharacterData && hasAllWorldbookComponents;
      
      return {
        session: session,
        status: session.status,
        progress: {
          completedTasks: session.research_state.completed_tasks.length,
          totalIterations: session.execution_info.current_iteration,
          knowledgeBaseSize: session.research_state.knowledge_base.length,
        },
        hasResult: hasResult || false,
        result: hasResult ? {
          character_data: session.generation_output.character_data,
          status_data: session.generation_output.status_data,
          user_setting_data: session.generation_output.user_setting_data,
          world_view_data: session.generation_output.world_view_data,
          supplement_data: session.generation_output.supplement_data,
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
    characterData?: any;
    hasStatusData: boolean;
    hasUserSettingData: boolean;
    hasWorldViewData: boolean;
    supplementDataCount: number;
    statusData?: any;
    userSettingData?: any;
    worldViewData?: any;
    supplementData?: any[];
  }> {
    try {
      const session = await ResearchSessionOperations.getSessionById(sessionId);
      if (!session) {
        return {
          hasCharacter: false,
          hasStatusData: false,
          hasUserSettingData: false,
          hasWorldViewData: false,
          supplementDataCount: 0,
        };
      }
      
      const hasCharacter = !!session.generation_output.character_data;
      const hasStatus = !!session.generation_output.status_data;
      const hasUserSetting = !!session.generation_output.user_setting_data;
      const hasWorldView = !!session.generation_output.world_view_data;
      const validSupplementCount = session.generation_output.supplement_data?.filter(e => e.content && e.content.trim() !== '').length || 0;

      return {
        hasCharacter,
        characterData: session.generation_output.character_data,
        hasStatusData: hasStatus,
        hasUserSettingData: hasUserSetting,
        hasWorldViewData: hasWorldView,
        supplementDataCount: validSupplementCount,
        statusData: session.generation_output.status_data,
        userSettingData: session.generation_output.user_setting_data,
        worldViewData: session.generation_output.world_view_data,
        supplementData: session.generation_output.supplement_data,
      };
      
    } catch (error) {
      console.error("Failed to get character progress:", error);
      return {
        hasCharacter: false,
        hasStatusData: false,
        hasUserSettingData: false,
        hasWorldViewData: false,
        supplementDataCount: 0,
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
            session.generation_output.status_data &&
            session.generation_output.user_setting_data &&
            session.generation_output.world_view_data &&
            (session.generation_output.supplement_data && session.generation_output.supplement_data.length >= 5)) {
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
  async generateAvatar(conversationId: string, userInputCallback?: UserInputCallback): Promise<{
    success: boolean;
    imageDescription?: string;
    imageUrl?: string;
    localImagePath?: string;
    outputFilePath?: string;
    candidateImages?: string[];
    generatedImage?: boolean;
    error?: string;
  }> {
    try {
      // Ensure ConfigManager is initialized
      if (!this.configManager.isConfigured()) {
        await this.configManager.initialize();
      }

      // Check if LLM configuration is available
      if (!this.configManager.isConfigured()) {
        return {
          success: false,
          error: "LLM configuration not found. Please run configuration setup first.",
        };
      }

      // Get the session data
      const session = await ResearchSessionOperations.getSessionById(conversationId);
      if (!session) {
        return { success: false, error: 'Session not found' };
      }

      const characterData = session.generation_output.character_data;
      const mainObjective = session.generation_output.character_data?.name || '';

      if (!characterData) {
        return { success: false, error: 'No character data found for avatar generation' };
      }

      let selectedImageUrl: string;
      let imageDescription: string = '';
      let candidateImages: string[] = [];
      let generatedImage: boolean = false;

      // Check if character already has an avatar URL (resume mode)
      if (characterData.avatar && this.isValidImageUrl(characterData.avatar)) {
        selectedImageUrl = characterData.avatar;
        imageDescription = 'Using existing avatar URL from character data';
      } else {
        const llmConfig = this.configManager.getLLMConfig();
        
        // Step 1: Ask user to choose between search and generation
        const choice = await this.askUserForImageChoice(userInputCallback);
        
        if (choice === 'generate') {
          // Step 2: Ask user to choose image style for AI generation
          const selectedStyle = await this.askUserForImageStyle(userInputCallback);
          // Generate detailed prompt for AI image generation with selected style
          imageDescription = await this.generateAIImagePrompt(mainObjective, characterData, llmConfig, selectedStyle);
          // Generate image using AI
          const generationResult = await this.generateImageWithAI(imageDescription, llmConfig);
          
          if (!generationResult.success || !generationResult.imageUrl) {
            return {
              success: false,
              error: generationResult.error || 'Image generation failed',
              imageDescription
            };
          }
          
          selectedImageUrl = generationResult.imageUrl;
          generatedImage = true;
        } else {
          // Generate search-optimized description for image search
          imageDescription = await this.generateImageDescription(mainObjective, characterData, llmConfig);
          // Search for images (original behavior)
        const imageResults = await this.searchImages(imageDescription, llmConfig.tavily_api_key || '');
        
        if (!imageResults.success || !imageResults.images || imageResults.images.length === 0) {
          return { 
            success: false, 
            error: imageResults.error || 'No images found',
            imageDescription 
          };
        }

        candidateImages = imageResults.images;

          // Step 3: Select best image using Jina AI
        const selectedUrl = await this.selectBestImage(imageResults.images, imageDescription, llmConfig, characterData);
        
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
      }

      // Step 4: Download image and convert to PNG
      const downloadResult = await this.downloadAndConvertImage(selectedImageUrl, characterData.name || 'character');
      
      if (!downloadResult.success) {
        return {
          success: false,
          error: downloadResult.error,
          imageDescription,
          imageUrl: selectedImageUrl,
          candidateImages: candidateImages,
          generatedImage
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
        candidateImages: candidateImages,
        generatedImage
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
   * Ask user to choose between searching for images or generating them with AI
   */
  private async askUserForImageChoice(userInputCallback?: UserInputCallback): Promise<'search' | 'generate'> {
    // If we have a user input callback, use it for interaction
    if (userInputCallback) {
      const choice = await userInputCallback(
        'How would you like to get the character image?',
        ['Search for existing images online (faster, uses web search)', 'Generate new image with AI (slower, creates unique image)']
      );
      
      // Map the choice to our return type
      if (choice.includes('Generate')) {
        return 'generate';
      } else {
        return 'search';
      }
    }
    
    // Fallback to inquirer if no callback provided
    const inquirer = await import('inquirer');
    
    const answer = await inquirer.default.prompt([
      {
        type: 'list',
        name: 'choice',
        message: 'How would you like to get the character image?',
        choices: [
          {
            name: 'Search for existing images online (faster, uses web search)',
            value: 'search'
          },
          {
            name: 'Generate new image with AI (slower, creates unique image)',
            value: 'generate'
          }
        ],
        default: 'search'
      }
    ]);
    
    return answer.choice;
  }

  /**
   * Ask user to choose image style for AI generation
   */
  private async askUserForImageStyle(userInputCallback?: UserInputCallback): Promise<string> {
    const styleOptions = [
      'Cute/Kawaii Style - kawaii, adorable, soft lighting, pastel colors, innocent expression',
      'Japanese Anime Style - anime artwork, anime style, key visual, vibrant, studio anime, highly detailed', 
      'Sci-fi/Tech Style - neonpunk style, cyberpunk, vaporwave, neon, vibes, vibrant, ultramodern, high contrast, cinematic',
      'Realistic/Photographic Style - cinematic photo, 35mm photograph, film, bokeh, professional, 4k, highly detailed',
      'Fantasy Style - ethereal fantasy concept art, magnificent, celestial, ethereal, painterly, epic, majestic, magical',
      'Dark/Gothic Style - dark atmosphere, gothic, dramatic lighting, moody, shadows, mysterious',
      'Minimalist Style - clean, simple, minimalist, modern, elegant, white background',
      'Retro/Vintage Style - analog film photo, faded film, desaturated, grainy, vignette, vintage, Kodachrome'
    ];

    // Create display options (only the part before the dash) for user selection
    const displayOptions = styleOptions.map(option => option.split(' - ')[0]);

    // If we have a user input callback, use it for interaction
    if (userInputCallback) {
      const choice = await userInputCallback(
        'Choose the style for your AI-generated image:',
        displayOptions
      );
      
      // Find the full option that matches the selected display name
      const selectedFullOption = styleOptions.find(option => option.startsWith(choice));
      return selectedFullOption || choice;
    }
    
    // Fallback to inquirer if no callback
    const inquirer = require('inquirer');
    const { style } = await inquirer.prompt([{
      type: 'list',
      name: 'style',
      message: 'Choose the style for your AI-generated image:',
      choices: displayOptions
    }]);
    
    // Find the full option that matches the selected display name
    const selectedFullOption = styleOptions.find(option => option.startsWith(style));
    return selectedFullOption || style;
  }

  /**
   * Generate image using fal-ai Stable Diffusion API
   */
  private async generateImageWithAI(description: string, llmConfig: any): Promise<{
    success: boolean;
    imageUrl?: string;
    error?: string;
  }> {
    try {
      // Check if FAL API key is configured
      const falApiKey = llmConfig.fal_api_key;
      if (!falApiKey || falApiKey.trim() === '') {
        return {
          success: false,
          error: 'FAL API key not configured. Please run \'./start.sh config\' to set up your FAL API key.'
        };
      }

      console.log('Generating image with AI...');
      
      // Import fal-ai client
      const { fal } = await import('@fal-ai/client');
      
      // Configure fal client
      fal.config({
        credentials: falApiKey
      });

      // Generate image using Stable Diffusion 3.5 Large
      const result = await fal.subscribe("fal-ai/stable-diffusion-v35-large", {
        input: {
          prompt: description,
          negative_prompt: "blurry, low quality, distorted, deformed, bad anatomy, ugly, worst quality, low resolution, watermark, text, signature",
          num_inference_steps: 28,
          guidance_scale: 3.5,
          num_images: 1,
          enable_safety_checker: true,
          output_format: "jpeg",
          image_size: "portrait_4_3" // Good for character portraits
        },
        logs: true,
        onQueueUpdate: (update) => {
          if (update.status === "IN_PROGRESS") {
            console.log('Generation in progress...');
            if (update.logs) {
              update.logs.map((log) => log.message).forEach(console.log);
            }
          }
        },
      });

      if (result.data && result.data.images && result.data.images.length > 0) {
        const imageUrl = result.data.images[0].url;
        console.log('Image generated successfully:', imageUrl);
        
        return {
          success: true,
          imageUrl: imageUrl
        };
      } else {
        return {
          success: false,
          error: 'No image generated by AI'
        };
      }
      
    } catch (error) {
      console.error('AI image generation failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during AI image generation'
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
      // Build character book entries from separated worldbook data
      const characterBookEntries: any[] = [];

      if (session.generation_output.status_data && session.generation_output.status_data.content && session.generation_output.status_data.content.trim() !== '') {
        characterBookEntries.push({
          comment: "STATUS",
          content: session.generation_output.status_data.content,
          keys: session.generation_output.status_data.keys || ["status"],
          insert_order: session.generation_output.status_data.insert_order || 1,
          position: session.generation_output.status_data.position || 0,
          constant: session.generation_output.status_data.constant || true,
          disable: session.generation_output.status_data.disable || false,
          depth: 4
        });
      }
      if (session.generation_output.user_setting_data && session.generation_output.user_setting_data.content && session.generation_output.user_setting_data.content.trim() !== '') {
        characterBookEntries.push({
          comment: "USER_SETTING",
          content: session.generation_output.user_setting_data.content,
          keys: session.generation_output.user_setting_data.keys || ["user", "player", "character"],
          insert_order: session.generation_output.user_setting_data.insert_order || 2,
          position: session.generation_output.user_setting_data.position || 0,
          constant: session.generation_output.user_setting_data.constant || true,
          disable: session.generation_output.user_setting_data.disable || false,
          depth: 4
        });
      }
      if (session.generation_output.world_view_data && session.generation_output.world_view_data.content && session.generation_output.world_view_data.content.trim() !== '') {
        characterBookEntries.push({
          comment: "WORLD_VIEW",
          content: session.generation_output.world_view_data.content,
          keys: session.generation_output.world_view_data.keys || ["world", "universe"],
          insert_order: session.generation_output.world_view_data.insert_order || 3,
          position: session.generation_output.world_view_data.position || 0,
          constant: session.generation_output.world_view_data.constant || true,
          disable: session.generation_output.world_view_data.disable || false,
          depth: 4
        });
      }
      if (session.generation_output.supplement_data && Array.isArray(session.generation_output.supplement_data)) {
        session.generation_output.supplement_data.forEach((entry: any) => {
          if (entry.content && entry.content.trim() !== '') {
            characterBookEntries.push({
              comment: entry.comment || 'SUPPLEMENTARY',
              content: entry.content,
              disable: entry.disable || false,
              position: entry.position || 2,
              constant: entry.constant || false,
              keys: entry.keys || [],
              insert_order: entry.insert_order || 10,
              depth: entry.depth || 4
            });
          }
        });
      }

      if (!characterData) {
        throw new Error('No character data found');
      }

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
   * Generate detailed AI image generation prompt optimized for Stable Diffusion
   */
  private async generateAIImagePrompt(mainObjective: string, characterData: any, llmConfig: any, style: string): Promise<string> {
    const { ChatOpenAI } = await import("@langchain/openai");
    const { ChatOllama } = await import("@langchain/ollama");
    const { ChatPromptTemplate } = await import("@langchain/core/prompts");

    // Create LLM instance
    let model: any;
    if (llmConfig.llm_type === "openai") {
      model = new ChatOpenAI({
        apiKey: llmConfig.api_key,
        modelName: llmConfig.model_name,
        temperature: 0.8, // Slightly higher for more creative prompts
        maxTokens: 800,
        ...(llmConfig.base_url && { configuration: { baseURL: llmConfig.base_url } })
      });
    } else {
      model = new ChatOllama({
        baseUrl: llmConfig.base_url || "http://localhost:11434",
        model: llmConfig.model_name,
        temperature: 0.8,
      });
    }

    const prompt = ChatPromptTemplate.fromTemplate(`
You are an expert AI image prompt engineer. Generate a concise, high-quality Stable Diffusion prompt.

==============================
📥 INPUT DATA:
- CHARACTER DATA: {characterData}
- STYLE: {style}

==============================
🎯 PROMPT STRUCTURE:

**FORMAT**: Generate exactly 100-200 characters of comma-separated keywords
**NO explanations, NO quotation marks, NO extra text**

**REQUIRED ELEMENTS (in order):**
1. **Quality tags**: Masterpiece, Top Quality, Best Quality
2. **Character type**: 1girl/1boy/1other/no humans, solo
3. **Main subject**: Brief character description (hair, eyes, expression)
4. **Key features**: 3-5 distinctive visual elements
5. **Environment**: Background/setting (if relevant)
6. **Artistic style**: Art medium, technique
7. **Technical**: High detail, resolution

**EXAMPLE OUTPUT:**
"Masterpiece, Top Quality, 1girl, silver hair, emerald eyes, ornate dress, castle background, fantasy portrait, digital art, high detail"

==============================
📋 RULES:

- **LENGTH**: 100-200 characters total
- **KEYWORDS ONLY**: No sentences, no explanations
- **PRECISE WORDS**: Each word must add unique value
- **NO REPETITION**: Avoid duplicate concepts
- **COMMA SEPARATED**: Clean formatting

==============================
✍️ GENERATE:

Based on the character data, create a concise prompt following the format above:
    `);

    const response = await model.invoke([
      await prompt.format({
        mainObjective: mainObjective,
        characterData: JSON.stringify(characterData, null, 2),
        style: style,
      }),
    ]);

    // Clean and optimize the response for advanced AI generation
    let aiPrompt = response.content as string;
    
    // Remove quotes and clean formatting while preserving structure
    aiPrompt = aiPrompt.replace(/^["']|["']$/g, '');
    aiPrompt = aiPrompt.replace(/\n+/g, ' ');
    aiPrompt = aiPrompt.replace(/\s+/g, ' ').trim();
    
    // Inject style keywords directly into the prompt
    if (style && style.trim()) {
      // Insert style keywords after quality tags
      const styleKeywords = style.trim();
      aiPrompt = aiPrompt.replace(/ABSURDRES/i, `ABSURDRES, ${styleKeywords}`);
    }
    
    console.log(`📏 Final prompt length: ${aiPrompt.length} characters`);
    console.log(`🎨 Style keywords applied: ${style}`);
    return aiPrompt;
  }

  /**
   * Generate precise image description based on character and worldbook data
   */
  private async generateImageDescription(mainObjective: string, characterData: any, llmConfig: any): Promise<string> {
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
      You are an expert at generating high-quality image search queries for character cards and story-based AI applications.
      
      ==============================
      🎯 MAIN OBJECTIVE
      
      Your ONLY task is to generate ONE concise, effective image search phrase (max 30 words) that best matches the **core visual representation** of the story or character. 
      
      You MUST treat **MAIN OBJECTIVE** as the **primary signal** for identifying whether the content is based in the real world or fictional imagination. It usually contains the highest-level topic and should guide your output strategy.
      
      ==============================
      📥 INPUTS:
      - MAIN OBJECTIVE: {mainObjective}
      - CHARACTER/STORY DATA: {characterData}
      
      ==============================
      🧭 DECISION STRATEGY:
      
      Step 1: Determine if this content is **REAL-WORLD RELATED**.
      A topic is considered **real-world** if MAIN OBJECTIVE or CHARACTER DATA refers to:
      - actual people (e.g. Elon Musk, Marie Curie, Bear Grylls)
      - real places (e.g. New York, Amazon rainforest)
      - nonfiction works (e.g. documentaries, biographies)
      - historical events (e.g. WWII, 9/11)
      - known real-world media (e.g. Breaking Bad, Planet Earth, Chernobyl)
      
      ✅ IF REAL-WORLD:
      → DO NOT describe what happens in the scene.
      → DO NOT generate stylized descriptions.
      → INSTEAD: Use known names of works or people.
      → Use one of the following formats:
         - "[TV show or documentary name] poster"
         - "[Real person name] portrait/photo"
         - "[Known event/place] documentary cover"
      
      Example outputs:
      - "Man vs Wild TV show poster"
      - "Bear Grylls portrait"
      - "Planet Earth BBC documentary cover"
      - "New York skyline aerial photo"
      - "Marie Curie historical photo"
      
      ---
      
      ❌ IF NO clear real-world signals are found:
      Treat as **FICTIONAL/NARRATIVE CONTENT**.
      
      ✅ FOR FICTIONAL/NARRATIVE:
      → Create a **visual scene description** with:
        - Art style: anime, fantasy, cinematic, oil painting, etc.
        - Main subject: character, setting, or iconic moment
        - Mood, setting, visual traits
      
      Example outputs:
      - "Anime portrait of silver-haired mage in glowing forest"
      - "Fantasy artwork of dragon flying over snow-covered village"
      - "Sci-fi cinematic shot of space traveler entering wormhole"
      - "Dark gothic painting of vampire queen on a crimson throne"
      
      ==============================
      🧪 RULES FOR OUTPUT:
      
      - Output MUST be a single search phrase
      - No extra formatting (no markdown, no quotes, no explanations)
      - Max 30 words
      - For real-world: use name + poster/photo/cover
      - For fictional: be visually rich and genre-aware
      - NO generic phrases like "character image" or "beautiful artwork"
      
      ==============================
      ✍️ FINAL TASK:
      
      Analyze MAIN OBJECTIVE first, then CHARACTER DATA.
      
      Then output ONE final search query:
      `);      

    const response = await model.invoke([
      await prompt.format({
        mainObjective: mainObjective,
        characterData: JSON.stringify(characterData, null, 2),
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
    console.log(`🔍 Generated image description: "${cleanDescription}"`);
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
    
    // Check for common image hosting domains and official content sources
    const validDomains = [
      'imgur.com', 'pixiv.net', 'deviantart.com', 'artstation.com',
      'pinterest.com', 'flickr.com', 'wikimedia.org', 'githubusercontent.com',
      // Official content sources
      'imdb.com', 'themoviedb.org', 'myanimelist.net', 'anilist.co',
      'crunchyroll.com', 'funimation.com', 'netflix.com', 'disney.com',
      'marvel.com', 'dc.com', 'studio-ghibli.net', 'toei-anim.co.jp',
      'bandainamco.com', 'square-enix.com', 'nintendo.com', 'playstation.com',
      // Media wikis and databases
      'fandom.com', 'wikia.com', 'wikipedia.org'
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
   * Use Jina AI multimodal embeddings to select the best image from search results
   */
  private async selectBestImage(imageUrls: string[], description: string, llmConfig: any, characterData: any): Promise<string | null> {
    if (imageUrls.length === 0) return null;
    
    // Check if Jina API key is available
    const jinaApiKey = llmConfig.jina_api_key;
    if (!jinaApiKey) {
      console.log("⚠️ No Jina API key found, using URL-based selection");
      return await this.selectImageByUrl(imageUrls, description, llmConfig, characterData);
    }

    console.log("🔍 Using Jina AI multimodal embeddings to analyze images...");

    try {
      // Prepare input for Jina AI embeddings
      const imagesToAnalyze = imageUrls.slice(0, 8); // Analyze up to 8 images
      const input = [
        { text: description }, // The target description
        ...imagesToAnalyze.map(url => ({ image: url })) // All candidate images
      ];

      const response = await fetch('https://api.jina.ai/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jinaApiKey}`,
        },
        body: JSON.stringify({
          model: 'jina-embeddings-v4',
          task: 'text-matching',
          input: input
        })
      });

      if (!response.ok) {
        throw new Error(`Jina API error: ${response.status} ${response.statusText}`);
      }

      const result: any = await response.json();
      const embeddings = result.data;

      if (!embeddings || embeddings.length < 2) {
        throw new Error("Invalid embeddings response from Jina AI");
      }

      // Calculate cosine similarity between description and each image
      const descriptionEmbedding = embeddings[0].embedding; // First embedding is the text description
      const imageEmbeddings = embeddings.slice(1); // Rest are image embeddings

      let bestImageIndex = 0;
      let bestSimilarity = -1;

      imageEmbeddings.forEach((imageEmb: { embedding: number[]; }, index: number) => {
        const similarity = this.cosineSimilarity(descriptionEmbedding, imageEmb.embedding);
        console.log(`📊 Image ${index + 1} similarity: ${similarity.toFixed(4)} - ${imagesToAnalyze[index]}`);
        
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestImageIndex = index;
        }
      });

      const selectedUrl = imagesToAnalyze[bestImageIndex];
      console.log(`✅ Jina AI selected best match (similarity: ${bestSimilarity.toFixed(4)}): ${selectedUrl}`);
      
      return selectedUrl;
      
    } catch (error) {
      console.error("❌ Jina AI embeddings failed:", error);
      console.log("🔄 Falling back to URL-based selection");
      return await this.selectImageByUrl(imageUrls, description, llmConfig, characterData);
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error("Vectors must have the same length");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }

  /**
   * Fallback method: Use LLM to select image based on URL analysis only
   */
  private async selectImageByUrl(imageUrls: string[], description: string, llmConfig: any, characterData: any): Promise<string | null> {
    if (imageUrls.length === 0) return null;
    
    const { ChatOpenAI } = await import("@langchain/openai");
    const { ChatOllama } = await import("@langchain/ollama");

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

    try {
      const prompt = `Select the best image URL for: ${description}

Character: ${characterData?.name || 'Character'}

URLs:
${imageUrls.slice(0, 8).map((url, index) => `${index + 1}. ${url}`).join('\n')}

Prioritize official content (posters, covers) and quality domains. Respond with only the full URL.`;

      const response = await model.invoke([{ role: "user", content: prompt }]);
      const selectedUrl = (response.content as string).trim();
      
      if (imageUrls.includes(selectedUrl)) {
        console.log(`✅ URL analysis selected: ${selectedUrl}`);
        return selectedUrl;
      } else {
        console.log(`⚠️ Invalid URL selection, using first candidate`);
        return imageUrls[0];
      }
      
    } catch (error) {
      console.error("❌ URL-based selection failed:", error);
      return imageUrls[0];
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
          return await this.generateAvatarForSession(session, userInputCallback);
          
        case 'already_complete':
          return {
            success: true,
            action: 'already_complete',
            result: {
              character_data: session.generation_output.character_data,
              status_data: session.generation_output.status_data,
              user_setting_data: session.generation_output.user_setting_data,
              world_view_data: session.generation_output.world_view_data,
              supplement_data: session.generation_output.supplement_data,
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
  private async generateAvatarForSession(session: ResearchSession, userInputCallback?: UserInputCallback): Promise<{
    success: boolean;
    action: 'avatar_generated';
    result?: any;
    error?: string;
  }> {
    try {
      const avatarResult = await this.generateAvatar(session.id, userInputCallback);
      
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
 
