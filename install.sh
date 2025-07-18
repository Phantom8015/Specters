#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' 


print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}========================================${NC}"
}


if [[ "$OSTYPE" != "linux-gnu"* ]]; then
    print_error "This script is designed for Linux only."
    print_error "Current OS: $OSTYPE"
    print_error "Please run this script on a Linux system."
    exit 1
fi

print_header "Specters - Setup Script"


command_exists() {
    command -v "$1" >/dev/null 2>&1
}


install_nodejs() {
    if command_exists node; then
        NODE_VERSION=$(node --version)
        print_status "Node.js is already installed: $NODE_VERSION"
        
        
        MAJOR_VERSION=$(echo $NODE_VERSION | sed 's/v//' | cut -d. -f1)
        if [ "$MAJOR_VERSION" -lt 16 ]; then
            print_warning "Node.js version is less than 16. Please update to Node.js 16 or higher."
        fi
    else
        print_status "Installing Node.js..."
        
        
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
        
        if command_exists node; then
            print_status "Node.js installed successfully: $(node --version)"
        else
            print_error "Failed to install Node.js"
            exit 1
        fi
    fi
}


install_git() {
    if command_exists git; then
        print_status "Git is already installed: $(git --version)"
    else
        print_status "Installing Git..."
        
        sudo apt-get update
        sudo apt-get install -y git
        
        if command_exists git; then
            print_status "Git installed successfully"
        else
            print_error "Failed to install Git"
            exit 1
        fi
    fi
}


install_system_deps() {
    print_status "Installing system dependencies..."
    
    sudo apt-get update
    sudo apt-get install -y build-essential python3 python3-pip
}


setup_repository() {
    REPO_URL="https://github.com/Phantom8015/Specters.git"
    PROJECT_DIR="Specters"
    
    if [ -d "$PROJECT_DIR" ]; then
        print_status "Project directory exists. Updating..."
        cd "$PROJECT_DIR"
        git pull origin main
    else
        print_status "Cloning repository..."
        git clone "$REPO_URL"
        cd "$PROJECT_DIR"
    fi
}


install_node_deps() {
    print_status "Installing Node.js dependencies..."
    
    
    if ! command_exists npm; then
        print_error "npm not found. Please ensure Node.js is properly installed."
        exit 1
    fi
    
    
    npm install
    
    if [ $? -eq 0 ]; then
        print_status "Dependencies installed successfully"
    else
        print_error "Failed to install dependencies"
        exit 1
    fi
}


setup_dev_env() {
    print_status "Setting up development environment..."
    
    
    if ! command_exists nodemon; then
        print_status "Installing nodemon globally..."
        npm install -g nodemon
    fi
    
    
    chmod +x install.sh
    if [ -f "a.sh" ]; then
        chmod +x a.sh
    fi
}


setup_systemd_service() {
    print_status "Setting up systemd service for auto-startup..."
    
    SERVICE_NAME="specters"
    SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
    CURRENT_USER=$(whoami)
    CURRENT_DIR=$(pwd)
    NODE_PATH=$(which node)
    
    if [ -z "$NODE_PATH" ]; then
        print_error "Node.js not found in PATH"
        return 1
    fi
    
    print_status "Creating systemd service file..."
    
    sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Specters
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
Restart=always
RestartSec=1
User=$CURRENT_USER
ExecStart=$NODE_PATH $CURRENT_DIR/server.js
WorkingDirectory=$CURRENT_DIR
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
EOF
    
    if [ $? -eq 0 ]; then
        print_status "Service file created successfully"
        
        print_status "Enabling and starting the service..."
        sudo systemctl daemon-reload
        sudo systemctl enable "$SERVICE_NAME"
        sudo systemctl start "$SERVICE_NAME"
        
        if sudo systemctl is-active --quiet "$SERVICE_NAME"; then
            print_status "Service started successfully and enabled for auto-startup"
            print_status "Service status:"
            sudo systemctl status "$SERVICE_NAME" --no-pager -l
        else
            print_error "Failed to start the service"
            print_status "Service logs:"
            sudo journalctl -u "$SERVICE_NAME" --no-pager -l
            return 1
        fi
    else
        print_error "Failed to create service file"
        return 1
    fi
}


main() {
    print_header "Starting Installation Process"
    
    
    install_git
    install_nodejs
    install_system_deps
    
    
    setup_repository
    install_node_deps
    setup_dev_env
    
    print_header "Installation Complete!"
    print_status "All components have been installed successfully!"
    print_status ""
    print_status "Manual startup commands:"
    echo -e "  ${BLUE}cd Specters${NC}"
    echo -e "  ${BLUE}npm start${NC}"
    echo ""
    print_status "For development mode with auto-reload:"
    echo -e "  ${BLUE}npm run dev${NC}"
    echo ""
    print_status "The server will be available at: http://localhost:3000"
    echo ""
    
    
    setup_systemd_service
    
    print_header "Setup Fully Complete!"
    print_status ""
    print_status "Service management commands:"
    echo -e "  ${BLUE}sudo systemctl status specters${NC}   - Check service status"
    echo -e "  ${BLUE}sudo systemctl stop specters${NC}    - Stop the service"
    echo -e "  ${BLUE}sudo systemctl start specters${NC}   - Start the service"
    echo -e "  ${BLUE}sudo systemctl restart specters${NC} - Restart the service"
    echo -e "  ${BLUE}sudo journalctl -u specters -f${NC}  - View live logs"
    echo ""
    print_warning "The service is now running and will automatically start on system boot."
}


if [ "$EUID" -eq 0 ]; then
    print_warning "This script is running as root. This is not recommended for Node.js applications."
    print_warning "Please run this script as a regular user."
    read -p "Do you want to continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi


main
