#!/bin/bash

# Character Generator CLI Installer

set -e

echo "🎭 Character & Worldbook Generator CLI Installer"
echo "================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Functions
print_error() {
    echo -e "${RED}❌ Error: $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed. Please install Node.js 16+ first."
        echo "Visit: https://nodejs.org/"
        exit 1
    fi
    
    local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 16 ]; then
        print_error "Node.js version 16+ required. Current version: $(node -v)"
        exit 1
    fi
    
    print_success "Node.js $(node -v) detected"
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm is not installed"
        exit 1
    fi
    
    print_success "npm $(npm -v) detected"
}

# Install from source
install_from_source() {
    print_info "Installing from source..."
    
    # Build the project
    ./build.sh --global
    
    if [ $? -eq 0 ]; then
        print_success "Installation completed!"
        echo ""
        echo -e "${CYAN}🚀 You can now use the CLI with:${NC}"
        echo "   chargen --help"
        echo "   character-generator --help"
        echo ""
        echo -e "${CYAN}💡 To get started:${NC}"
        echo "   chargen generate"
    else
        print_error "Installation failed"
        exit 1
    fi
}

# Install from npm package
install_from_package() {
    print_info "Installing from npm package..."
    
    # First create the package
    ./build.sh --package
    
    # Find the created package
    PACKAGE_FILE=$(ls *.tgz | head -n1)
    
    if [ -f "$PACKAGE_FILE" ]; then
        print_info "Installing package: $PACKAGE_FILE"
        npm install -g "$PACKAGE_FILE"
        
        if [ $? -eq 0 ]; then
            print_success "Package installation completed!"
            echo ""
            echo -e "${CYAN}🚀 You can now use the CLI with:${NC}"
            echo "   chargen --help"
            echo "   character-generator --help"
            
            # Clean up package file
            rm "$PACKAGE_FILE"
        else
            print_error "Package installation failed"
            exit 1
        fi
    else
        print_error "Package creation failed"
        exit 1
    fi
}

# Install binary
install_binary() {
    print_info "Creating standalone binary..."
    
    ./build.sh --binary
    
    if [ -d "bin" ] && [ -f "bin/chargen-macos" ]; then
        echo ""
        print_info "Available installation options:"
        echo "1. Install to /usr/local/bin (requires sudo)"
        echo "2. Install to ~/bin (user local)"
        echo "3. Manual installation"
        echo ""
        
        read -p "Choose option (1-3): " choice
        
        case $choice in
            1)
                print_info "Installing to /usr/local/bin..."
                if [[ "$OSTYPE" == "darwin"* ]]; then
                    sudo cp bin/chargen-macos /usr/local/bin/chargen
                elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
                    sudo cp bin/chargen-linux /usr/local/bin/chargen
                else
                    print_error "Unsupported OS for automatic installation"
                    exit 1
                fi
                sudo chmod +x /usr/local/bin/chargen
                print_success "Binary installed to /usr/local/bin/chargen"
                ;;
            2)
                print_info "Installing to ~/bin..."
                mkdir -p ~/bin
                if [[ "$OSTYPE" == "darwin"* ]]; then
                    cp bin/chargen-macos ~/bin/chargen
                elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
                    cp bin/chargen-linux ~/bin/chargen
                else
                    print_error "Unsupported OS for automatic installation"
                    exit 1
                fi
                chmod +x ~/bin/chargen
                print_success "Binary installed to ~/bin/chargen"
                print_warning "Make sure ~/bin is in your PATH"
                ;;
            3)
                print_info "Manual installation:"
                echo "Binaries are available in the ./bin/ directory:"
                ls -la bin/
                echo ""
                echo "Copy the appropriate binary to your desired location:"
                echo "  cp bin/chargen-macos /your/path/chargen  # macOS"
                echo "  cp bin/chargen-linux /your/path/chargen  # Linux"
                echo "  cp bin/chargen-win.exe /your/path/      # Windows"
                return
                ;;
            *)
                print_error "Invalid choice"
                exit 1
                ;;
        esac
        
        echo ""
        echo -e "${CYAN}🚀 You can now use the CLI with:${NC}"
        echo "   chargen --help"
    else
        print_error "Binary creation failed"
        exit 1
    fi
}

# Main installation menu
show_menu() {
    echo "Choose installation method:"
    echo ""
    echo "1. 🔗 Link from source (recommended for development)"
    echo "2. 📦 Install from npm package"
    echo "3. 🔧 Create standalone binary"
    echo "4. ❌ Cancel"
    echo ""
    
    read -p "Enter your choice (1-4): " choice
    
    case $choice in
        1)
            install_from_source
            ;;
        2)
            install_from_package
            ;;
        3)
            install_binary
            ;;
        4)
            echo "Installation cancelled"
            exit 0
            ;;
        *)
            print_error "Invalid choice. Please enter 1-4."
            show_menu
            ;;
    esac
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --source)
            check_prerequisites
            install_from_source
            exit 0
            ;;
        --package)
            check_prerequisites
            install_from_package
            exit 0
            ;;
        --binary)
            check_prerequisites
            install_binary
            exit 0
            ;;
        --help)
            echo "Character Generator CLI Installer"
            echo ""
            echo "Usage: ./install.sh [option]"
            echo ""
            echo "Options:"
            echo "  (no args)     Show interactive menu"
            echo "  --source      Install from source (npm link)"
            echo "  --package     Install from npm package"
            echo "  --binary      Create and install standalone binary"
            echo "  --help        Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Run interactive menu if no arguments provided
check_prerequisites
show_menu 