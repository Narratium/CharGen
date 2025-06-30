import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs-extra';
import * as path from 'path';
import { AgentService } from '../core/agent-service';
import { getStorageDir } from '../data/local-storage';

interface CLIOptions {
  output?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  type?: 'openai' | 'ollama';
}

interface Config {
  defaultModel?: string;
  defaultApiKey?: string;
  defaultBaseUrl?: string;
  defaultType?: 'openai' | 'ollama';
  temperature?: number;
  maxTokens?: number;
  tavilyApiKey?: string; // Add Tavily API key support
}

export class CharacterGeneratorCLI {
  private agentService: AgentService;
  private config: Config = {};

  constructor() {
    this.agentService = new AgentService();
    // Initialize storage and load config
    this.initialize();
  }

  /**
   * Initialize CLI with storage and configuration
   */
  private async initialize(): Promise<void> {
    try {
      // Initialize storage first
      await this.initializeStorage();
      // Then load config
      await this.loadConfig();
    } catch (error) {
      console.error('Failed to initialize CLI:', error);
    }
  }

  /**
   * Initialize storage directory and files
   */
  private async initializeStorage(): Promise<void> {
    const { initializeDataFiles } = await import('../data/local-storage');
    await initializeDataFiles();
  }

  /**
   * Run the generator with simplified interface
   */
  async runDirect(options: CLIOptions): Promise<void> {
    console.log(chalk.cyan('🎭 Character & Worldbook Generator\n'));

    // Single story question  
    const storyAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'story',
        message: 'What kind of story would you like to create?',
        validate: (input: string) => input.trim().length > 0 || 'Please describe the story you want to create',
      }
    ]);
    
    const story = storyAnswer.story;

    // Use saved configuration
    const llmConfig = await this.getLLMConfigFromSaved(options);

    await this.startGeneration({
      story,
      llmConfig,
      outputDir: options.output || './output',
    });
  }

  /**
   * Start the generation process
   */
  private async startGeneration(params: {
    story: string;
    llmConfig: any;
    outputDir: string;
  }): Promise<void> {
    console.log(chalk.blue('\n🎯 Generation Configuration:'));
    console.log(chalk.gray(`  Story: ${params.story}`));
    console.log(chalk.gray(`  AI Model: ${params.llmConfig.llm_type} - ${params.llmConfig.model_name}`));
    console.log(chalk.gray(`  Output: ${params.outputDir}`));
    console.log('');

    const spinner = ora('Initializing character generation...').start();

    try {
      // Create user input callback function
      const userInputCallback = async (message?: string): Promise<string> => {
        spinner.stop(); // Stop spinner before user input
        console.log(chalk.yellow('\n💬 Need more information:'));
        if (message) {
          console.log(chalk.gray(`${message}`));
        }
        
        const answer = await inquirer.prompt([{
          type: 'input',
          name: 'input',
          message: 'Please provide more details:',
          validate: (input: string) => input.trim().length > 0 || 'Please provide input',
        }]);
        
        spinner.start('Continuing...'); // Restart spinner
        return answer.input;
      };

      // Start the generation with user input callback
      console.log('🚀 [CLI] Starting agent service...');
      const result = await this.agentService.startGeneration(
        params.story,
        params.llmConfig,
        userInputCallback // Pass the callback
      );
      console.log(`📋 [CLI] Generation result: Success=${result.success}`);

      if (!result.success) {
        spinner.fail('Failed to start generation');
        console.error(chalk.red('Error:'), result.error);
        return;
      }

      // Generation completed - get final result
      const status = await this.agentService.getSessionStatus(result.conversationId);
      
      if (status.hasResult && status.result) {
        spinner.succeed('Character generation completed!');
        
        // Post-processing: Generate avatar image
        await this.handleAvatarGeneration(result.conversationId, spinner);
        
        await this.saveResults(status.result, params.outputDir);
        
        // Show generation statistics
        await this.showGenerationStats(result.conversationId);
      } else {
        spinner.fail('Generation completed but no results found');
      }

    } catch (error) {
      spinner.fail('Generation failed');
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
    }
  }

  /**
   * Handle avatar generation as post-processing step
   */
  private async handleAvatarGeneration(conversationId: string, spinner: any): Promise<void> {
    try {
      // Ask user if they want to generate avatar
      spinner.stop();
      
      const avatarAnswer = await inquirer.prompt([{
        type: 'confirm',
        name: 'generateAvatar',
        message: 'Would you like to search for an avatar image for this character?',
        default: true,
      }]);

      if (!avatarAnswer.generateAvatar) {
        console.log(chalk.gray('Skipping avatar generation.'));
        return;
      }

      spinner = ora('Generating avatar image...').start();
      spinner.text = 'Analyzing character data to create image description...';

      const avatarResult = await this.agentService.generateAvatar(conversationId);
      
      if (avatarResult.success) {
        spinner.succeed('Avatar generation completed!');
        
        console.log(chalk.blue('\n🖼️  Avatar Generation Results:'));
        console.log(chalk.gray(`  Image Description: ${avatarResult.imageDescription}`));
        
        if (avatarResult.localImagePath) {
          console.log(chalk.green(`  ✅ Downloaded Image: ${avatarResult.localImagePath}`));
        }
        
        if (avatarResult.outputFilePath) {
          console.log(chalk.green(`  📋 Character Card: ${avatarResult.outputFilePath}`));
        }
        
        if (avatarResult.candidateImages && avatarResult.candidateImages.length > 1) {
          console.log(chalk.gray(`  📸 Found ${avatarResult.candidateImages.length} candidate images`));
          
          // Optionally show candidates
          const showCandidates = await inquirer.prompt([{
            type: 'confirm',
            name: 'showCandidates',
            message: 'Would you like to see all candidate images?',
            default: false,
          }]);
          
          if (showCandidates.showCandidates) {
            console.log(chalk.blue('\n📸 Candidate Images:'));
            avatarResult.candidateImages.forEach((url, index) => {
              console.log(chalk.gray(`  ${index + 1}. ${url}`));
            });
          }
        }
      } else {
        spinner.fail('Avatar generation failed');
        console.log(chalk.yellow(`⚠️  ${avatarResult.error}`));
        
        if (avatarResult.error?.includes('Tavily API key')) {
          console.log(chalk.gray('💡 Run "char-gen config" to set up your Tavily API key for image search.'));
        }
      }
    } catch (error) {
      spinner.fail('Avatar generation failed');
      console.error(chalk.red('Avatar generation error:'), error instanceof Error ? error.message : error);
    }
  }

  /**
   * Show generation statistics
   */
  private async showGenerationStats(conversationId: string): Promise<void> {
    try {
      const summary = await this.agentService.getConversationSummary(conversationId);
      const progress = await this.agentService.getGenerationOutput(conversationId);
      
      if (summary && progress) {
        console.log(chalk.blue('\n📊 Generation Statistics:'));
        console.log(chalk.gray(`  Messages: ${summary.messageCount}`));
      }
    } catch (error) {
      console.error('Failed to show stats:', error);
    }
  }

  /**
   * Save generation results
   */
  private async saveResults(result: any, outputDir: string): Promise<void> {
    await fs.ensureDir(outputDir);
    
    console.log(chalk.blue('\n💾 Saving results...'));

    // Generate standard format character card first
    if (result.character_data) {
      const characterName = result.character_data.name || 'character';
      const safeFileName = characterName.replace(/[^a-zA-Z0-9\-_]/g, '_').toLowerCase();
      
      // Build character book entries from worldbook data
      const characterBookEntries = (result.worldbook_data || []).map((entry: any, index: number) => ({
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
          name: result.character_data.name,
          description: result.character_data.description,
          personality: result.character_data.personality,
          first_mes: result.character_data.first_mes,
          scenario: result.character_data.scenario,
          mes_example: result.character_data.mes_example,
          creator_notes: result.character_data.creator_notes,
          // Only include fields that exist
          ...(result.character_data.system_prompt && { system_prompt: result.character_data.system_prompt }),
          ...(result.character_data.post_history_instructions && { post_history_instructions: result.character_data.post_history_instructions }),
          ...(result.character_data.tags && { tags: result.character_data.tags }),
          ...(result.character_data.creator && { creator: result.character_data.creator }),
          ...(result.character_data.character_version && { character_version: result.character_data.character_version }),
          ...(result.character_data.alternate_greetings && { alternate_greetings: result.character_data.alternate_greetings }),
          // Add character book if worldbook exists
          ...(characterBookEntries.length > 0 && {
            character_book: {
              entries: characterBookEntries
            }
          })
        }
      };

      const standardPath = path.join(outputDir, `${safeFileName}_card.json`);
      await fs.writeJson(standardPath, standardFormat, { spaces: 2 });
      console.log(chalk.green('  ✅ Standard character card:'), chalk.cyan(standardPath));
    }
    
    // Save individual files for reference
    if (result.character_data) {
      const characterFile = path.join(outputDir, 'character.json');
      await fs.writeJson(characterFile, result.character_data, { spaces: 2 });
      console.log(chalk.gray('  📄 Character data:'), characterFile);
      
      // Show avatar info if present
      if (result.character_data.avatar) {
        console.log(chalk.green('  🖼️  Avatar image:'), result.character_data.avatar);
      }
    }
    
    // Save worldbook
    if (result.worldbook_data) {
      const worldbookFile = path.join(outputDir, 'worldbook.json');
      await fs.writeJson(worldbookFile, result.worldbook_data, { spaces: 2 });
      console.log(chalk.gray('  📚 Worldbook:'), worldbookFile);
    }
    
    // Save knowledge base (new feature)
    if (result.knowledge_base && result.knowledge_base.length > 0) {
      const knowledgeFile = path.join(outputDir, 'knowledge_base.json');
      await fs.writeJson(knowledgeFile, result.knowledge_base, { spaces: 2 });
      console.log(chalk.gray('  🧠 Knowledge base:'), knowledgeFile);
    }
    
    // Save complete result
    const fullResultFile = path.join(outputDir, 'complete_result.json');
    await fs.writeJson(fullResultFile, result, { spaces: 2 });
    console.log(chalk.gray('  💾 Complete result:'), fullResultFile);

    console.log(chalk.blue('\n✨ All files saved to:'), chalk.cyan(path.resolve(outputDir)));
  }

  /**
   * Configure default settings
   */
  async configureSettings(): Promise<void> {
    console.log(chalk.blue.bold('⚙️  Configuration Setup\n'));
    
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'llmType',
        message: 'Default AI service:',
        choices: [
          { name: 'OpenAI (GPT models)', value: 'openai' },
          { name: 'Ollama (Local models)', value: 'ollama' },
        ],
        default: this.config.defaultType || 'openai',
      },
      {
        type: 'input',
        name: 'model',
        message: 'Default model:',
        default: this.config.defaultModel,
      },
      {
        type: 'password',
        name: 'apiKey',
        message: 'Default OpenAI API key (optional):',
        default: this.config.defaultApiKey,
        when: (answers: any) => answers.llmType === 'openai',
      },
      {
        type: 'input',
        name: 'baseUrl',
        message: 'Default base URL (optional):',
        default: this.config.defaultBaseUrl,
      },
      {
        type: 'number',
        name: 'temperature',
        message: 'Default temperature (0-1):',
        default: this.config.temperature || 0.7,
        validate: (input: number) => (input >= 0 && input <= 1) || 'Temperature must be between 0 and 1',
      },
      {
        type: 'number',
        name: 'maxTokens',
        message: 'Default max tokens:',
        default: this.config.maxTokens || 4000,
        validate: (input: number) => input > 0 || 'Max tokens must be positive',
      },
      {
        type: 'password',
        name: 'tavilyApiKey',
        message: 'Tavily API key (for enhanced search, optional):',
        default: this.config.tavilyApiKey,
      },
    ]);

    this.config = {
      defaultType: answers.llmType,
      defaultModel: answers.model,
      defaultApiKey: answers.apiKey,
      defaultBaseUrl: answers.baseUrl,
      temperature: answers.temperature,
      maxTokens: answers.maxTokens,
      tavilyApiKey: answers.tavilyApiKey,
    };

    await this.saveConfig();
    console.log(chalk.green('✅ Configuration saved!'));
  }

  /**
   * List previous generations
   */
  async listGenerations(): Promise<void> {
    console.log(chalk.blue.bold('📋 Previous Generations\n'));
    
    const conversations = await this.agentService.listConversations();
    
    if (conversations.length === 0) {
      console.log(chalk.gray('No previous generations found.'));
      return;
    }

    // Updated to use new data structure
    console.table(conversations.map(conv => ({
      ID: conv.id.slice(0, 8),
      Title: conv.title,
      Status: conv.status,
      'Has Character': conv.generation_output.character_data ? '✅' : '❌',
      'Has Worldbook': (conv.generation_output.worldbook_data && conv.generation_output.worldbook_data.length > 0) ? '✅' : '❌',
      'Knowledge': conv.research_state.knowledge_base.length,
    })));

    // Show overall statistics
    const stats = await this.agentService.getGenerationStats();
    console.log(chalk.blue('\n📊 Overall Statistics:'));
    console.log(chalk.gray(`  Total Conversations: ${stats.totalConversations}`));
    console.log(chalk.gray(`  Completed Generations: ${stats.completedGenerations}`));
    console.log(chalk.gray(`  Success Rate: ${stats.successRate.toFixed(1)}%`));
    console.log(chalk.gray(`  Average Iterations: ${stats.averageIterations.toFixed(1)}`));
    console.log(chalk.gray(`  Average Knowledge Base Size: ${stats.averageKnowledgeBaseSize.toFixed(1)}`));
    console.log(chalk.gray(`  Average Tokens Used: ${stats.averageTokensUsed.toFixed(0)}`));
  }

  /**
   * Export a specific generation
   */
  async exportGeneration(id: string, options: { format?: string; output?: string }): Promise<void> {
    const conversations = await this.agentService.listConversations();
    const conversation = conversations.find(c => c.id.startsWith(id));
    
    if (!conversation) {
      console.error(chalk.red('❌ Generation not found with ID:'), id);
      return;
    }

    const outputFile = options.output || `export_${id.slice(0, 8)}.${options.format || 'json'}`;
    
    // Updated to use new data structure
    if (options.format === 'card' && conversation.generation_output.character_data) {
      await fs.writeJson(outputFile, conversation.generation_output.character_data, { spaces: 2 });
    } else if (options.format === 'worldbook' && conversation.generation_output.worldbook_data) {
      await fs.writeJson(outputFile, conversation.generation_output.worldbook_data, { spaces: 2 });
    } else {
      // Export both character progress and task state
      const exportData = {
        generation_output: conversation.generation_output,
        research_state: conversation.research_state,
        conversation_info: {
          id: conversation.id,
          title: conversation.title,
          status: conversation.status,
        },
      };
      await fs.writeJson(outputFile, exportData, { spaces: 2 });
    }
    
    console.log(chalk.green('✅ Exported to:'), chalk.cyan(outputFile));
  }

  /**
   * Clear all generation history
   */
  async clearHistory(): Promise<void> {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to delete all generation history? This action cannot be undone.',
        default: false,
      },
    ]);

    if (confirm) {
      const spinner = ora('Clearing history...').start();
      try {
        await this.agentService.clearAllSessions();
        spinner.succeed('All generation history has been cleared.');
      } catch (error) {
        spinner.fail('Failed to clear history.');
        console.error(chalk.red('Error:'), error);
      }
    } else {
      console.log(chalk.gray('Operation cancelled.'));
    }
  }

  /**
   * Get LLM configuration from saved settings
   */
  private async getLLMConfigFromSaved(options: CLIOptions): Promise<any> {
    // Command line options take priority
    const llmType = options.type || this.config.defaultType;
    const model = options.model || this.config.defaultModel;
    const apiKey = options.apiKey || this.config.defaultApiKey;
    const baseUrl = options.baseUrl || this.config.defaultBaseUrl;

    // Check if we have required configuration
    if (!llmType || !model) {
      console.log(chalk.yellow('⚠️  No LLM configuration found.'));
      console.log(chalk.gray('Please run the following command to configure:'));
      console.log(chalk.cyan('  char-gen config'));
      throw new Error('LLM configuration required. Please run "char-gen config" first.');
    }

    // Check API key for OpenAI
    if (llmType === 'openai' && !apiKey) {
      console.log(chalk.yellow('⚠️  OpenAI API key not configured.'));
      console.log(chalk.gray('Please run the following command to configure:'));
      console.log(chalk.cyan('  char-gen config'));
      throw new Error('OpenAI API key required. Please run "char-gen config" first.');
    }

    return {
      llm_type: llmType,
      model_name: model,
      api_key: apiKey || '',
      base_url: baseUrl || (llmType === 'ollama' ? 'http://localhost:11434' : undefined),
      temperature: this.config.temperature || 0.7,
      max_tokens: this.config.maxTokens || 4000,
      tavily_api_key: this.config.tavilyApiKey || '',
    };
  }

  /**
   * Helper methods
   */
  private async promptIfMissing(message: string, defaultValue?: string): Promise<string> {
    if (process.stdin.isTTY) {
      const answer = await inquirer.prompt([{
        type: 'input',
        name: 'value',
        message,
        default: defaultValue,
      }]);
      return answer.value;
    }
    return defaultValue || '';
  }

  private async loadConfig(): Promise<void> {
    try {
      const configPath = path.join(getStorageDir(), 'config.json');
      if (await fs.pathExists(configPath)) {
        this.config = await fs.readJson(configPath);
      }
    } catch (error) {
      // Config doesn't exist or is invalid, use defaults
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      const configPath = path.join(getStorageDir(), 'config.json');
      await fs.writeJson(configPath, this.config, { spaces: 2 });
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  /**
   * Resume a previous generation
   */
  async resumeGeneration(): Promise<void> {
    console.log(chalk.blue.bold('🔄 Resume Previous Generation\n'));
    
    const conversations = await this.agentService.listConversations();
    
    if (conversations.length === 0) {
      console.log(chalk.gray('No previous generations found.'));
      return;
    }

    // Filter and categorize conversations (async operations)
    const categorizedConversations = await this.categorizeConversations(conversations);
    
    const incompleteConversations = categorizedConversations.incomplete;
    const completeWithoutAvatar = categorizedConversations.needsAvatar;
    const fullyComplete = categorizedConversations.complete;

    // Create choices with category headers
    const choices: any[] = [];
    
          if (incompleteConversations.length > 0) {
        choices.push(new inquirer.Separator(chalk.yellow('📝 Incomplete Generations (can be continued):')));
        incompleteConversations.forEach(conv => {
          const completionInfo = this.getCompletionInfo(conv);
          choices.push({
            name: `${conv.id.slice(0, 8)} - ${conv.title} ${completionInfo}`,
            value: { id: conv.id, action: 'continue' },
            short: conv.id.slice(0, 8)
          });
        });
      }

      if (completeWithoutAvatar.length > 0) {
        choices.push(new inquirer.Separator(chalk.blue('🖼️  Complete (needs local download):')));
        completeWithoutAvatar.forEach(conv => {
          choices.push({
            name: `${conv.id.slice(0, 8)} - ${conv.title} (download avatar)`,
            value: { id: conv.id, action: 'avatar' },
            short: conv.id.slice(0, 8)
          });
        });
      }

      if (fullyComplete.length > 0) {
        choices.push(new inquirer.Separator(chalk.green('✅ Fully Complete (with local files):')));
        fullyComplete.forEach(conv => {
          choices.push({
            name: `${conv.id.slice(0, 8)} - ${conv.title} (view only)`,
            value: { id: conv.id, action: 'view' },
            short: conv.id.slice(0, 8)
          });
        });
      }

    if (choices.length === 0) {
      console.log(chalk.gray('No generations available for resumption.'));
      return;
    }

    choices.push(new inquirer.Separator());
    choices.push({
      name: chalk.gray('Cancel'),
      value: null
    });

    const selection = await inquirer.prompt([{
      type: 'list',
      name: 'conversation',
      message: 'Select a generation to resume:',
      choices: choices,
      pageSize: 15
    }]);

    if (!selection.conversation) {
      console.log(chalk.gray('Operation cancelled.'));
      return;
    }

    await this.handleResumeAction(selection.conversation);
  }

  /**
   * Handle the resume action based on selection
   */
  private async handleResumeAction(selection: { id: string; action: string }): Promise<void> {
    const spinner = ora('Loading session...').start();

    try {
      // Create user input callback for resume operations
      const userInputCallback = async (message?: string): Promise<string> => {
        spinner.stop();
        console.log(chalk.yellow('\n💬 Need more information:'));
        if (message) {
          console.log(chalk.gray(`${message}`));
        }
        
        const answer = await inquirer.prompt([{
          type: 'input',
          name: 'input',
          message: 'Please provide more details:',
          validate: (input: string) => input.trim().length > 0 || 'Please provide input',
        }]);
        
        spinner.start('Continuing...');
        return answer.input;
      };

      if (selection.action === 'view') {
        // Just show the complete generation details
        const status = await this.agentService.getSessionStatus(selection.id);
        spinner.succeed('Generation loaded!');
        
        if (status.hasResult && status.result) {
          console.log(chalk.green('\n✅ Complete Generation:'));
          await this.showGenerationResults(status.result);
        }
        return;
      }

      // Resume the session
      spinner.text = `Resuming generation (${selection.action})...`;
      const result = await this.agentService.resumeSession(selection.id, userInputCallback);

      if (!result.success) {
        spinner.fail('Failed to resume generation');
        console.error(chalk.red('Error:'), result.error);
        return;
      }

      // Handle different resume results
      switch (result.action) {
        case 'continued':
          spinner.succeed('Generation resumed and completed!');
          console.log(chalk.green('\n🎉 Generation continued successfully!'));
          
          // Show final results
          const status = await this.agentService.getSessionStatus(selection.id);
          if (status.hasResult && status.result) {
            await this.showGenerationResults(status.result);
            
            // Ask about avatar generation if not already done
            if (!status.result.character_data?.avatar) {
              await this.handleAvatarGeneration(selection.id, spinner);
            }
          }
          break;

        case 'avatar_generated':
          spinner.succeed('Avatar generation completed!');
          console.log(chalk.blue('\n🖼️  Avatar Generation Results:'));
          
          if (result.result?.imageDescription) {
            console.log(chalk.gray(`  Description: ${result.result.imageDescription}`));
          }
          if (result.result?.localImagePath) {
            console.log(chalk.green(`  ✅ Downloaded Image: ${result.result.localImagePath}`));
          }
          if (result.result?.outputFilePath) {
            console.log(chalk.green(`  📋 Character Card: ${result.result.outputFilePath}`));
          }
          if (result.result?.candidateImages) {
            console.log(chalk.gray(`  📸 Found ${result.result.candidateImages.length} candidate images`));
          }
          break;

        case 'already_complete':
          spinner.succeed('Generation is already complete!');
          console.log(chalk.green('\n✅ This generation is already fully complete:'));
          await this.showGenerationResults(result.result);
          break;
      }

      // Show generation statistics
      await this.showGenerationStats(selection.id);

    } catch (error) {
      spinner.fail('Resume operation failed');
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
    }
  }

  /**
   * Check if local image file exists for the character
   */
  private async checkLocalImageExists(characterName: string): Promise<boolean> {
    try {
      const safeFileName = (characterName || 'character').replace(/[^a-zA-Z0-9\-_]/g, '_').toLowerCase();
      const imagePath = path.join(process.cwd(), 'output', 'images', `${safeFileName}.png`);
      
      return await fs.pathExists(imagePath);
    } catch (error) {
      return false;
    }
  }

  /**
   * Categorize conversations based on completion status and local file existence
   */
  private async categorizeConversations(conversations: any[]): Promise<{
    incomplete: any[];
    needsAvatar: any[];
    complete: any[];
  }> {
    const incomplete: any[] = [];
    const needsAvatar: any[] = [];
    const complete: any[] = [];

    for (const conv of conversations) {
      const isStatusComplete = conv.status === 'completed';
      const isCharacterComplete = this.isCharacterComplete(conv.generation_output.character_data);
      const hasAvatarUrl = !!conv.generation_output.character_data?.avatar;
      
      if (!isStatusComplete || !isCharacterComplete) {
        incomplete.push(conv);
        continue;
      }

      if (!hasAvatarUrl) {
        needsAvatar.push(conv);
        continue;
      }

      // Check if local image file exists
      const characterName = conv.generation_output.character_data?.name;
      const hasLocalImage = await this.checkLocalImageExists(characterName);
      
      if (hasLocalImage) {
        complete.push(conv);
      } else {
        needsAvatar.push(conv);
      }
    }

    return { incomplete, needsAvatar, complete };
  }

  /**
   * Check if character data is complete
   */
  private isCharacterComplete(characterData?: any): boolean {
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

  /**
   * Get completion information for display
   */
  private getCompletionInfo(conversation: any): string {
    const hasCharacter = !!conversation.generation_output.character_data;
    const hasWorldbook = !!(conversation.generation_output.worldbook_data && conversation.generation_output.worldbook_data.length > 0);
    const avatar = conversation.generation_output.character_data?.avatar;
    
    const indicators = [];
    if (hasCharacter) indicators.push('📝');
    if (hasWorldbook) indicators.push('🌍');
    if (avatar) indicators.push('🔗'); // Show link icon for avatar URL
    
    const status = conversation.status === 'completed' ? '✅' : '⏳';
    
    return `${status} [${indicators.join('')}]`;
  }

  /**
   * Show generation results in formatted output
   */
  private async showGenerationResults(result: any): Promise<void> {
    if (result.character_data) {
      console.log(chalk.blue('  📝 Character Card:'), chalk.cyan(result.character_data.name || 'Unnamed'));
      if (result.character_data.avatar) {
        console.log(chalk.blue('  🖼️  Avatar:'), chalk.cyan(result.character_data.avatar));
      }
    }
    
    if (result.worldbook_data) {
      console.log(chalk.blue('  🌍 Worldbook:'), chalk.cyan(`${result.worldbook_data.length} entries`));
    }
    
    if (result.knowledge_base) {
      console.log(chalk.blue('  📚 Knowledge Base:'), chalk.cyan(`${result.knowledge_base.length} entries`));
    }
  }
} 