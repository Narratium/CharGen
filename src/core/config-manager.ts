import path from 'path';
import fs from 'fs-extra';

/**
 * LLM Configuration interface
 */
export interface LLMConfig {
  model_name: string;
  api_key: string;
  base_url?: string;
  llm_type: "openai" | "ollama";
  temperature: number;
  max_tokens?: number;
  tavily_api_key?: string;
  jina_api_key?: string;
  fal_api_key?: string;
}

/**
 * Application configuration interface
 */
export interface AppConfig {
  defaultModel?: string;
  defaultApiKey?: string;
  defaultBaseUrl?: string;
  defaultType?: 'openai' | 'ollama';
  temperature?: number;
  maxTokens?: number;
  tavilyApiKey?: string;
  jinaApiKey?: string;
  falApiKey?: string;
}

/**
 * Configuration Manager
 * Provides centralized access to configuration with no redundant data storage
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig = {};
  private initialized: boolean = false;

  private constructor() {}

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Initialize configuration from file system
   */
  async initialize(configPath?: string): Promise<void> {
    if (this.initialized) return;

    try {
      const configFilePath = configPath || this.getDefaultConfigPath();
      if (await fs.pathExists(configFilePath)) {
        this.config = await fs.readJson(configFilePath);
      }
      this.initialized = true;
    } catch (error) {
      console.warn('Failed to load configuration, using defaults');
      this.config = {};
      this.initialized = true;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): AppConfig {
    if (!this.initialized) {
      throw new Error('ConfigManager not initialized. Call initialize() first.');
    }
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  async updateConfig(newConfig: Partial<AppConfig>): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    this.config = { ...this.config, ...newConfig };
    await this.saveConfig();
  }

  /**
   * Get LLM configuration for tool execution
   * Combines defaults with command line overrides
   */
  getLLMConfig(overrides?: {
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    type?: 'openai' | 'ollama';
  }): LLMConfig {
    if (!this.initialized) {
      throw new Error('ConfigManager not initialized. Call initialize() first.');
    }

    const llmType = overrides?.type || this.config.defaultType || 'openai';
    const model = overrides?.model || this.config.defaultModel;
    const apiKey = overrides?.apiKey || this.config.defaultApiKey;
    const baseUrl = overrides?.baseUrl || this.config.defaultBaseUrl;

    if (!model) {
      throw new Error('LLM model not configured. Please run configuration setup.');
    }

    if (llmType === 'openai' && !apiKey) {
      throw new Error('OpenAI API key not configured. Please run configuration setup.');
    }

    return {
      llm_type: llmType,
      model_name: model,
      api_key: apiKey || '',
      base_url: baseUrl || (llmType === 'ollama' ? 'http://localhost:11434' : undefined),
      temperature: this.config.temperature || 0.7,
      max_tokens: this.config.maxTokens || 4000,
      tavily_api_key: this.config.tavilyApiKey || '',
      jina_api_key: this.config.jinaApiKey || '',
      fal_api_key: this.config.falApiKey || '',
    };
  }

  /**
   * Check if configuration is complete
   */
  isConfigured(): boolean {
    if (!this.initialized) return false;
    
    const hasBasicConfig = !!(this.config.defaultType && this.config.defaultModel);
    const hasApiKey = this.config.defaultType === 'ollama' || !!this.config.defaultApiKey;
    
    return hasBasicConfig && hasApiKey;
  }

  /**
   * Validate FAL API key availability
   */
  hasFalApiKey(): boolean {
    return !!(this.config.falApiKey && this.config.falApiKey.trim() !== '');
  }

  /**
   * Validate Tavily API key availability
   */
  hasTavilyApiKey(): boolean {
    return !!(this.config.tavilyApiKey && this.config.tavilyApiKey.trim() !== '');
  }

  /**
   * Validate Jina API key availability
   */
  hasJinaApiKey(): boolean {
    return !!(this.config.jinaApiKey && this.config.jinaApiKey.trim() !== '');
  }

  /**
   * Save configuration to file
   */
  private async saveConfig(): Promise<void> {
    try {
      const configPath = this.getDefaultConfigPath();
      await fs.ensureDir(path.dirname(configPath));
      await fs.writeJson(configPath, this.config, { spaces: 2 });
    } catch (error) {
      throw new Error(`Failed to save configuration: ${error}`);
    }
  }

  /**
   * Get default configuration file path
   */
  private getDefaultConfigPath(): string {
    // Use the same path as the original implementation
    const { getStorageDir } = require('../data/local-storage');
    return path.join(getStorageDir(), 'config.json');
  }

  /**
   * Reset configuration
   */
  async resetConfig(): Promise<void> {
    this.config = {};
    await this.saveConfig();
  }
} 