#!/bin/bash

# Character Generator CLI Build Script

echo "🎭 Building Character & Worldbook Generator CLI..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    exit 1
fi

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
    echo "📦 Installing pnpm..."
    npm install -g pnpm
fi

echo "📥 Installing dependencies..."
pnpm install

echo "🔨 Building TypeScript..."
pnpm run build

# Make the CLI executable
if [ -f "dist/index.js" ]; then
    chmod +x dist/index.js
    echo "✅ Build completed successfully!"
    echo ""
    echo "🚀 You can now run the CLI with:"
    echo "   node dist/index.js --help"
    echo ""
    echo "📝 Or install globally with:"
    echo "   npm link"
    echo "   char-gen --help"
    echo ""
    echo "💡 To get started:"
    echo "   char-gen generate --interactive"
else
    echo "❌ Build failed - output file not found"
    exit 1
fi 