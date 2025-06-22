# 🎭 Character & Worldbook Generator CLI

An AI-powered command-line tool for generating character cards and worldbook entries using advanced planning-based architecture.

## Features

- 🤖 **AI-Powered Generation**: Uses OpenAI GPT models or local Ollama models
- 📋 **Plan-Based Architecture**: Intelligent task planning and execution
- 🎯 **Interactive Mode**: Step-by-step guided character creation
- 📦 **Batch Mode**: Direct command-line generation
- 💾 **Export Options**: JSON, character cards, worldbooks
- ⚙️ **Configurable**: Save default settings for quick access
- 🔄 **Progress Tracking**: Real-time generation monitoring

## Installation

### Prerequisites

- Node.js 16+ 
- pnpm (will be installed automatically if missing)

### Quick Start

1. **Clone and Build**:
   ```bash
   git clone <repository>
   cd character-generator
   ./build.sh
   ```

2. **Run Interactive Mode**:
   ```bash
   char-gen generate --interactive
   ```

3. **Or install globally**:
   ```bash
   npm link
   char-gen generate --interactive
   ```

## Usage

### Interactive Mode (Recommended)

Start the interactive character generation wizard:

```bash
char-gen generate --interactive
```

This will guide you through:
- Character description
- AI model selection
- API key configuration
- Output settings

### Direct Mode

Generate characters with command-line arguments:

```bash
# Using OpenAI
char-gen generate \
  --model gpt-4 \
  --api-key YOUR_API_KEY \
  --type openai \
  --output ./my-character

# Using Ollama (local)
char-gen generate \
  --model llama2 \
  --base-url http://localhost:11434 \
  --type ollama \
  --output ./my-character
```

### Configuration

Set up default settings to avoid repetitive inputs:

```bash
char-gen config
```

This saves your preferred:
- AI service (OpenAI/Ollama)
- Default model
- API keys
- Temperature settings

### List Previous Generations

```bash
char-gen list
```

### Export Specific Generation

```bash
# Export complete result
char-gen export <generation-id>

# Export only character card
char-gen export <generation-id> --format card

# Export only worldbook
char-gen export <generation-id> --format worldbook
```

## Command Reference

### Main Commands

- `generate` (alias: `gen`) - Generate new character and worldbook
- `config` - Configure default settings
- `list` - List previous generations
- `export <id>` - Export specific generation

### Generate Options

- `-i, --interactive` - Interactive mode with prompts
- `-o, --output <dir>` - Output directory (default: ./output)
- `-m, --model <model>` - AI model to use
- `-k, --api-key <key>` - API key for AI service
- `-u, --base-url <url>` - Base URL for AI service
- `-t, --type <type>` - AI service type (openai|ollama)

### Export Options

- `-f, --format <format>` - Export format (json|card|worldbook)
- `-o, --output <file>` - Output file path

## AI Model Support

### OpenAI Models
- GPT-4 (recommended)
- GPT-3.5-turbo
- Custom fine-tuned models

### Ollama Models (Local)
- Llama 2
- Mistral
- CodeLlama
- Any locally available model

## Output Structure

Generated files are saved to the specified output directory:

```
output/
├── character.json          # Character card data
├── worldbook.json          # Worldbook entries
├── integration_notes.md    # Usage instructions
└── complete_result.json    # Full generation result
```

### Character Card Format

```json
{
  "name": "Character Name",
  "description": "Character description...",
  "personality": "Personality traits...",
  "scenario": "Setting/scenario...",
  "first_mes": "First message...",
  "mes_example": "Example messages...",
  "creator_notes": "Creator notes...",
  "tags": ["tag1", "tag2"],
  "alternate_greetings": ["greeting1", "greeting2"]
}
```

### Worldbook Entry Format

```json
[
  {
    "id": "entry-id",
    "key": ["trigger", "keywords"],
    "content": "Entry content...",
    "comment": "Entry description",
    "constant": false,
    "order": 100
  }
]
```

## Configuration

Configuration is stored in `~/.character-generator/config.json`:

```json
{
  "defaultType": "openai",
  "defaultModel": "gpt-4",
  "defaultApiKey": "sk-...",
  "temperature": 0.7,
  "maxTokens": 4000
}
```

## Storage

All data is stored locally in `~/.character-generator/`:

- `config.json` - User configuration
- `agent_conversations.json` - Generation history
- Other data files for characters and worldbooks

## Examples

### Simple Character Generation

```bash
# Interactive mode - easiest way
char-gen generate -i

# Direct mode with minimal options
char-gen generate -m gpt-4 -k YOUR_API_KEY -t openai
```

### Advanced Usage

```bash
# Generate with specific settings
char-gen generate \
  --model gpt-4 \
  --api-key sk-your-key \
  --type openai \
  --output ./fantasy-character \
  --interactive

# Use local Ollama model
char-gen generate \
  --model llama2 \
  --type ollama \
  --base-url http://localhost:11434 \
  --output ./local-character
```

### Export and Share

```bash
# List all generations
char-gen list

# Export specific character
char-gen export abc12345 --format card --output my-character.json

# Export worldbook only
char-gen export abc12345 --format worldbook --output worldbook.json
```

## Troubleshooting

### Common Issues

1. **API Key Issues**:
   ```bash
   # Set up configuration first
   char-gen config
   ```

2. **Build Issues**:
   ```bash
   # Clean build
   rm -rf dist node_modules
   ./build.sh
   ```

3. **Permission Issues**:
   ```bash
   # Make scripts executable
   chmod +x build.sh start.sh
   ```

4. **Ollama Connection Issues**:
   ```bash
   # Check Ollama is running
   curl http://localhost:11434/api/tags
   ```

### Debug Mode

Set environment variable for detailed logging:

```bash
DEBUG=character-generator char-gen generate -i
```

## Architecture

The CLI tool uses a sophisticated plan-based AI architecture:

1. **Agent Engine**: Central planning and execution
2. **Tool Registry**: Modular tool system (planning, search, output)
3. **Thought Buffer**: AI reasoning and decision tracking
4. **Plan Pool**: Hierarchical task management
5. **Local Storage**: File-based data persistence

## Contributing

The codebase is organized as follows:

```
src/
├── cli/                    # CLI interface
├── core/                   # Agent engine and service
├── data/                   # Storage operations
├── models/                 # Type definitions
└── tools/                  # AI tools (planning, output, etc.)
```

## License

MIT License - see LICENSE file for details.

---

**Happy character creating! 🎭✨** 