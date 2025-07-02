#!/bin/bash

# Character Generator CLI Startup Script

# Check if dist directory exists
if [ ! -d "dist" ]; then
    echo "Building project..."
    ./build.sh
    if [ $? -ne 0 ]; then
        echo "Build failed. Please check the errors above."
        exit 1
    fi
fi

# Check if main file exists
if [ ! -f "dist/index.js" ]; then
    echo "Built files not found. Please run ./build.sh first."
    exit 1
fi

# Run the CLI with passed arguments
node dist/index.js "$@" 