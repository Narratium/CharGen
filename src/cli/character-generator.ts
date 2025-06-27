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
      const status = await this.agentService.getConversationStatus(result.conversationId);
      
      if (status.hasResult && status.result) {
        spinner.succeed('Character generation completed!');
        await this.saveResults(status.result, params.outputDir);
        console.log(chalk.green('\n✅ Character and worldbook saved to:'), chalk.cyan(params.outputDir));
        
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
   * Show generation statistics
   */
  private async showGenerationStats(conversationId: string): Promise<void> {
    try {
      const summary = await this.agentService.getConversationSummary(conversationId);
      const progress = await this.agentService.getGenerationOutput(conversationId);
      
      if (summary && progress) {
        console.log(chalk.blue('\n📊 Generation Statistics:'));
        console.log(chalk.gray(`  Messages: ${summary.messageCount}`));
        console.log(chalk.gray(`  Knowledge Base: ${summary.knowledgeBaseSize} entries`));
        console.log(chalk.gray(`  Completion: ${summary.completionPercentage}%`));
        console.log(chalk.gray(`  Search Coverage: ${progress.searchCoverage}%`));
        console.log(chalk.gray(`  Answer Confidence: ${progress.answerConfidence}%`));
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
    
    // Save character card
    if (result.character_data) {
      const characterFile = path.join(outputDir, 'character.json');
      await fs.writeJson(characterFile, result.character_data, { spaces: 2 });
      console.log(chalk.gray('  📄 Character card:'), characterFile);
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
    
    // Save quality metrics
    if (result.quality_metrics) {
      const metricsFile = path.join(outputDir, 'quality_metrics.json');
      await fs.writeJson(metricsFile, result.quality_metrics, { spaces: 2 });
      console.log(chalk.gray('  📈 Quality metrics:'), metricsFile);
    }
    
    // Save completion status
    if (result.completion_status) {
      const statusFile = path.join(outputDir, 'completion_status.json');
      await fs.writeJson(statusFile, result.completion_status, { spaces: 2 });
      console.log(chalk.gray('  ✅ Completion status:'), statusFile);
    }
    
    // Save complete result
    const fullResultFile = path.join(outputDir, 'complete_result.json');
    await fs.writeJson(fullResultFile, result, { spaces: 2 });
    console.log(chalk.gray('  💾 Complete result:'), fullResultFile);
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
    ]);

    this.config = {
      defaultType: answers.llmType,
      defaultModel: answers.model,
      defaultApiKey: answers.apiKey,
      defaultBaseUrl: answers.baseUrl,
      temperature: answers.temperature,
      maxTokens: answers.maxTokens,
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
} 