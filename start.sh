#!/bin/bash

# Character Generator CLI Startup Script

echo "🎭 Character & Worldbook Generator CLI"
echo "======================================="

# Check if dist directory exists
if [ ! -d "dist" ]; then
    echo "📦 Project not built yet. Building now..."
    ./build.sh
    if [ $? -ne 0 ]; then
        echo "❌ Build failed. Please check the errors above."
        exit 1
    fi
fi

# Check if main file exists
if [ ! -f "dist/index.js" ]; then
    echo "❌ Built files not found. Please run ./build.sh first."
    exit 1
fi

echo ""
echo "🚀 Starting Character Generator..."
echo ""

# Run the CLI with passed arguments
node dist/index.js "$@" 