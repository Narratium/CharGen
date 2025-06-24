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
  interactive?: boolean;
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
   * Run in interactive mode
   */
  async runInteractive(options: CLIOptions): Promise<void> {
    console.log(chalk.cyan('🎯 Starting interactive character generation...\n'));

    // Get user input
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'title',
        message: 'Character generation title:',
        default: 'My Character',
      },
      {
        type: 'input',
        name: 'description',
        message: 'Describe the character you want to create:',
        validate: (input: string) => input.trim().length > 0 || 'Please provide a character description',
      },
      {
        type: 'list',
        name: 'llmType',
        message: 'Choose AI service:',
        choices: [
          { name: 'OpenAI (GPT models)', value: 'openai' },
          { name: 'Ollama (Local models)', value: 'ollama' },
        ],
        default: options.type || this.config.defaultType || 'openai',
      },
    ]);

    // Get model-specific configuration
    let llmConfig;
    if (answers.llmType === 'openai') {
      const openaiAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'model',
          message: 'OpenAI model:',
          default: options.model || this.config.defaultModel || 'gpt-4',
        },
        {
          type: 'password',
          name: 'apiKey',
          message: 'OpenAI API key:',
          default: options.apiKey || this.config.defaultApiKey,
          validate: (input: string) => input.trim().length > 0 || 'API key is required',
        },
        {
          type: 'input',
          name: 'baseUrl',
          message: 'Base URL (optional):',
          default: options.baseUrl || this.config.defaultBaseUrl,
        },
      ]);

      llmConfig = {
        llm_type: 'openai' as const,
        model_name: openaiAnswers.model,
        api_key: openaiAnswers.apiKey,
        base_url: openaiAnswers.baseUrl || undefined,
        temperature: this.config.temperature || 0.7,
        max_tokens: this.config.maxTokens || 4000,
      };
    } else {
      const ollamaAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'model',
          message: 'Ollama model:',
          default: options.model || this.config.defaultModel || 'llama2',
        },
        {
          type: 'input',
          name: 'baseUrl',
          message: 'Ollama base URL:',
          default: options.baseUrl || this.config.defaultBaseUrl || 'http://localhost:11434',
        },
      ]);

      llmConfig = {
        llm_type: 'ollama' as const,
        model_name: ollamaAnswers.model,
        api_key: '', // Not needed for Ollama
        base_url: ollamaAnswers.baseUrl,
        temperature: this.config.temperature || 0.7,
        max_tokens: this.config.maxTokens || 4000,
      };
    }

    // Start generation
    await this.startGeneration({
      title: answers.title,
      description: answers.description,
      llmConfig,
      outputDir: options.output || './output',
    });
  }

  /**
   * Run with direct parameters
   */
  async runDirect(options: CLIOptions): Promise<void> {
    // Get required parameters
    const title = await this.promptIfMissing('Character title:', 'My Character');
    const description = await this.promptIfMissing('Character description:', '');
    
    if (!description) {
      throw new Error('Character description is required');
    }

    const llmType = options.type || this.config.defaultType || 'openai';
    const model = options.model || this.config.defaultModel || (llmType === 'openai' ? 'gpt-4' : 'llama2');
    
    let apiKey = options.apiKey || this.config.defaultApiKey;
    if (llmType === 'openai' && !apiKey) {
      const answer = await inquirer.prompt([{
        type: 'password',
        name: 'apiKey',
        message: 'OpenAI API key:',
        validate: (input: string) => input.trim().length > 0 || 'API key is required',
      }]);
      apiKey = answer.apiKey;
    }

    const llmConfig = {
      llm_type: llmType,
      model_name: model,
      api_key: apiKey || '',
      base_url: options.baseUrl || this.config.defaultBaseUrl,
      temperature: this.config.temperature || 0.7,
      max_tokens: this.config.maxTokens || 4000,
    };

    await this.startGeneration({
      title,
      description,
      llmConfig,
      outputDir: options.output || './output',
    });
  }

  /**
   * Start the generation process
   */
  private async startGeneration(params: {
    title: string;
    description: string;
    llmConfig: any;
    outputDir: string;
  }): Promise<void> {
    console.log(chalk.blue('\n🎯 Generation Configuration:'));
    console.log(chalk.gray(`  Title: ${params.title}`));
    console.log(chalk.gray(`  Description: ${params.description}`));
    console.log(chalk.gray(`  AI Model: ${params.llmConfig.llm_type} - ${params.llmConfig.model_name}`));
    console.log(chalk.gray(`  Output: ${params.outputDir}`));
    console.log('');

    const spinner = ora('Initializing character generation...').start();

    try {
      // Create user input callback function
      const userInputCallback = async (message?: string): Promise<string> => {
        spinner.stop(); // Stop spinner before user input
        console.log(chalk.yellow('\n💬 The AI needs more information from you:'));
        if (message) {
          console.log(chalk.gray(`Message: ${message}`));
        }
        
        const answer = await inquirer.prompt([{
          type: 'input',
          name: 'input',
          message: 'Please provide additional details:',
          validate: (input: string) => input.trim().length > 0 || 'Please provide input',
        }]);
        
        spinner.start('Continuing generation...'); // Restart spinner
        return answer.input;
      };

      // Start the generation with user input callback
      console.log('🚀 [CLI] Starting agent service...');
      const result = await this.agentService.startGeneration(
        params.title,
        params.description,
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
      } else {
        spinner.fail('Generation completed but no results found');
      }

    } catch (error) {
      spinner.fail('Generation failed');
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
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
    
    // Save integration notes
    if (result.integration_notes) {
      const notesFile = path.join(outputDir, 'integration_notes.md');
      await fs.writeFile(notesFile, result.integration_notes);
      console.log(chalk.gray('  📝 Integration notes:'), notesFile);
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

    console.table(conversations.map(conv => ({
      ID: conv.id.slice(0, 8),
      Title: conv.title,
      Status: conv.status,
      Created: new Date(conv.created_at).toLocaleDateString(),
      'Has Result': conv.task_progress.character_data ? '✅' : '❌',
    })));
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
    
    if (options.format === 'card' && conversation.task_progress.character_data) {
      await fs.writeJson(outputFile, conversation.task_progress.character_data, { spaces: 2 });
    } else if (options.format === 'worldbook' && conversation.task_progress.worldbook_data) {
      await fs.writeJson(outputFile, conversation.task_progress.worldbook_data, { spaces: 2 });
    } else {
      await fs.writeJson(outputFile, conversation.task_progress, { spaces: 2 });
    }
    
    console.log(chalk.green('✅ Exported to:'), chalk.cyan(outputFile));
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