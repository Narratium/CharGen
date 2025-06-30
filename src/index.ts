#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { CharacterGeneratorCLI } from './cli/character-generator';

const program = new Command();

program
  .name('char-gen')
  .description('AI-powered character card and worldbook generator')
  .version('1.0.0');

program
  .command('generate')
  .alias('gen')
  .description('Generate a character card and worldbook')
  .option('-o, --output <dir>', 'Output directory', './output')
  .option('-m, --model <model>', 'AI model to use')
  .option('-k, --api-key <key>', 'API key for the AI service')
  .option('-u, --base-url <url>', 'Base URL for AI service')
  .option('-t, --type <type>', 'AI service type (openai|ollama)', 'openai')
  .action(async (options) => {
    try {
      const generator = new CharacterGeneratorCLI();
        await generator.runDirect(options);
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('config')
  .description('Configure default settings')
  .action(async () => {
    const generator = new CharacterGeneratorCLI();
    await generator.configureSettings();
  });

program
  .command('list')
  .description('List previous generations')
  .action(async () => {
    const generator = new CharacterGeneratorCLI();
    await generator.listGenerations();
  });

program
  .command('resume')
  .description('Resume a previous generation')
  .action(async () => {
    const generator = new CharacterGeneratorCLI();
    await generator.resumeGeneration();
  });

program
  .command('clear')
  .description('Clear all generation history')
  .action(async () => {
    const generator = new CharacterGeneratorCLI();
    await generator.clearHistory();
  });

program
  .command('export <id>')
  .description('Export a specific generation')
  .option('-f, --format <format>', 'Export format (json|card|worldbook)', 'json')
  .option('-o, --output <file>', 'Output file path')
  .action(async (id, options) => {
    const generator = new CharacterGeneratorCLI();
    await generator.exportGeneration(id, options);
  });

// Handle unknown commands
program.on('command:*', () => {
  console.error(chalk.red('❌ Invalid command: %s'), program.args.join(' '));
  console.log(chalk.yellow('💡 See --help for a list of available commands.'));
  process.exit(1);
});

// Parse command line arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
} 