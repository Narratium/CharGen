#!/bin/bash

# Character Generator CLI Build Script

# Parse command line arguments
BUILD_MODE="dev"
INSTALL_GLOBAL=false
CREATE_PACKAGE=false
CREATE_BINARY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --package)
            CREATE_PACKAGE=true
            BUILD_MODE="package"
            shift
            ;;
        --binary)
            CREATE_BINARY=true
            BUILD_MODE="binary"
            shift
            ;;
        --global)
            INSTALL_GLOBAL=true
            shift
            ;;
        --help)
            echo "Character Generator CLI Build Script"
            echo ""
            echo "Usage: ./build.sh [options]"
            echo ""
            echo "Options:"
            echo "  (no args)     Build for local development"
            echo "  --package     Build npm package for distribution"
            echo "  --binary      Build standalone binary (requires pkg)"
            echo "  --global      Install globally after build"
            echo "  --help        Show this help message"
            echo ""
            echo "Examples:"
            echo "  ./build.sh                 # Basic build"
            echo "  ./build.sh --package       # Create distributable package"
            echo "  ./build.sh --binary        # Create standalone executable"
            echo "  ./build.sh --global        # Build and install globally"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo "🎭 Building Character & Worldbook Generator CLI..."
echo "📋 Build mode: $BUILD_MODE"

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
    echo "✅ Basic build completed successfully!"
else
    echo "❌ Build failed - output file not found"
    exit 1
fi

# Handle different build modes
if [ "$CREATE_PACKAGE" = true ]; then
    echo ""
    echo "📦 Creating npm package..."
    
    # Create tarball
    npm pack
    PACKAGE_FILE=$(ls *.tgz | head -n1)
    
    if [ -f "$PACKAGE_FILE" ]; then
        echo "✅ Package created: $PACKAGE_FILE"
        echo ""
        echo "📝 To install this package:"
        echo "   npm install -g $PACKAGE_FILE"
        echo ""
        echo "🚀 Or publish to npm registry:"
        echo "   npm publish"
    fi
fi

if [ "$CREATE_BINARY" = true ]; then
    echo ""
    echo "🔧 Creating standalone binary..."
    
    # Check if pkg is installed
    if ! command -v pkg &> /dev/null; then
        echo "📦 Installing pkg..."
        npm install -g pkg
    fi
    
    # Create binaries for different platforms
    mkdir -p bin
    
    echo "Building for macOS..."
    pkg dist/index.js --target node18-macos-x64 --output bin/chargen-macos
    
    echo "Building for Linux..."
    pkg dist/index.js --target node18-linux-x64 --output bin/chargen-linux
    
    echo "Building for Windows..."
    pkg dist/index.js --target node18-win-x64 --output bin/chargen-win.exe
    
    if [ -f "bin/chargen-macos" ]; then
        echo "✅ Binaries created in ./bin/ directory"
        echo ""
        echo "📱 Available binaries:"
        ls -la bin/
        echo ""
        echo "🚀 To install system-wide (macOS/Linux):"
        echo "   sudo cp bin/chargen-macos /usr/local/bin/chargen"
        echo "   # or"
        echo "   sudo cp bin/chargen-linux /usr/local/bin/chargen"
    fi
fi

if [ "$INSTALL_GLOBAL" = true ]; then
    echo ""
    echo "🌐 Installing globally..."
    npm link
    
    if [ $? -eq 0 ]; then
        echo "✅ Global installation completed!"
        echo ""
        echo "🚀 You can now run from anywhere:"
        echo "   chargen --help"
        echo "   character-generator --help"
    else
        echo "❌ Global installation failed"
        exit 1
    fi
fi

echo ""
echo "🎉 Build completed!"
echo ""
echo "🚀 Usage options:"
echo "   Local:     ./start.sh --help"
echo "   Node:      node dist/index.js --help"

if [ "$INSTALL_GLOBAL" = true ]; then
    echo "   Global:    chargen --help"
fi

echo ""
echo "💡 To get started:"
echo "   ./start.sh generate --interactive" 