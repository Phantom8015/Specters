#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status()  { echo -e "${GREEN}[INFO]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
print_header()  {
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}========================================${NC}"
}

command_exists() { command -v "$1" >/dev/null 2>&1; }

OS=$(uname -s)
case "$OS" in
  Darwin) PLATFORM="macos" ;;
  Linux)  PLATFORM="linux" ;;
  *)
    print_error "Unsupported OS: $OS"
    exit 1
    ;;
esac

print_header "Specters — Install Script ($OS)"

if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
  print_warning "Running as root is not recommended for Node.js apps."
  read -r -p "Continue anyway? (y/N): " confirm
  [[ "$confirm" =~ ^[Yy]$ ]] || exit 1
fi

install_homebrew() {
  if command_exists brew; then
    print_status "Homebrew already installed: $(brew --version | head -1)"
    return
  fi
  print_status "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  if [[ -f "/opt/homebrew/bin/brew" ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  fi
}

install_nodejs() {
  if command_exists node; then
    NODE_VERSION=$(node --version)
    MAJOR=$(echo "$NODE_VERSION" | sed 's/v//' | cut -d. -f1)
    print_status "Node.js already installed: $NODE_VERSION"
    if [[ "$MAJOR" -lt 16 ]]; then
      print_warning "Node.js $NODE_VERSION is too old (need ≥16). Upgrading..."
      if [[ "$PLATFORM" == "macos" ]]; then
        brew upgrade node || brew install node
      else
        curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
        sudo apt-get install -y nodejs
      fi
    fi
    return
  fi

  print_status "Installing Node.js..."
  if [[ "$PLATFORM" == "macos" ]]; then
    brew install node
  else
    curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi

  command_exists node && print_status "Node.js installed: $(node --version)" \
    || { print_error "Node.js installation failed"; exit 1; }
}

install_system_deps_linux() {
  print_status "Installing build dependencies..."
  sudo apt-get update -qq
  sudo apt-get install -y build-essential python3 python3-pip git
}

install_xcode_cli() {
  if xcode-select -p &>/dev/null; then
    print_status "Xcode Command Line Tools already installed"
    return
  fi
  print_status "Installing Xcode Command Line Tools..."
  xcode-select --install
  print_warning "A dialog may have appeared. Please complete the installation, then re-run this script."
  exit 0
}

setup_repository() {
  REPO_URL="https://github.com/Phantom8015/Specters.git"
  PROJECT_DIR="Specters"

  if [[ -d "$PROJECT_DIR" ]]; then
    print_status "Repository exists — pulling latest changes..."
    git -C "$PROJECT_DIR" pull origin main
  else
    print_status "Cloning repository..."
    git clone "$REPO_URL"
  fi

  cd "$PROJECT_DIR"
}

install_node_deps() {
  print_status "Installing Node.js dependencies..."
  npm install && print_status "Dependencies installed" \
    || { print_error "npm install failed"; exit 1; }
}

setup_systemd() {
  print_status "Setting up systemd service..."

  SERVICE_NAME="specters"
  SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
  CURRENT_USER=$(whoami)
  CURRENT_DIR=$(pwd)
  NODE_PATH=$(which node)

  sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Specters File Manager
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

  sudo systemctl daemon-reload
  sudo systemctl enable "$SERVICE_NAME"
  sudo systemctl restart "$SERVICE_NAME"

  if sudo systemctl is-active --quiet "$SERVICE_NAME"; then
    print_status "Systemd service started and enabled"
  else
    print_error "Service failed to start — check: sudo journalctl -u specters -f"
    exit 1
  fi
}

setup_launchd() {
  print_status "Setting up launchd service..."

  PLIST_LABEL="com.specters.app"
  PLIST_PATH="$HOME/Library/LaunchAgents/${PLIST_LABEL}.plist"
  CURRENT_DIR=$(pwd)
  NODE_PATH=$(which node)
  LOG_DIR="$HOME/Library/Logs/Specters"

  mkdir -p "$LOG_DIR"

  cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_PATH}</string>
    <string>${CURRENT_DIR}/server.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${CURRENT_DIR}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>PORT</key>
    <string>3000</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${LOG_DIR}/output.log</string>
  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/error.log</string>
</dict>
</plist>
EOF

  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  launchctl load -w "$PLIST_PATH"

  print_status "launchd service loaded — Specters will start automatically on login"
  print_status "Logs: $LOG_DIR"
}

main() {
  print_header "Starting Installation"

  if [[ "$PLATFORM" == "macos" ]]; then
    install_homebrew
    install_xcode_cli
  else
    install_system_deps_linux
  fi

  install_nodejs
  setup_repository
  install_node_deps

  print_header "Installation Complete"
  print_status "Manual start:  npm start"
  print_status "Dev mode:      npm run dev"
  print_status "App URL:       http://localhost:3000"
  echo ""

  if [[ "$PLATFORM" == "macos" ]]; then
    setup_launchd
    print_header "Setup Complete"
    echo ""
    print_status "Service management (macOS):"
    echo -e "  ${BLUE}launchctl stop  com.specters.app${NC}   — stop"
    echo -e "  ${BLUE}launchctl start com.specters.app${NC}   — start"
    echo -e "  ${BLUE}launchctl unload ~/Library/LaunchAgents/com.specters.app.plist${NC}  — disable autostart"
    echo -e "  ${BLUE}tail -f ~/Library/Logs/Specters/output.log${NC}  — live logs"
  else
    setup_systemd
    print_header "Setup Complete"
    echo ""
    print_status "Service management (Linux):"
    echo -e "  ${BLUE}sudo systemctl status  specters${NC}"
    echo -e "  ${BLUE}sudo systemctl stop    specters${NC}"
    echo -e "  ${BLUE}sudo systemctl start   specters${NC}"
    echo -e "  ${BLUE}sudo systemctl restart specters${NC}"
    echo -e "  ${BLUE}sudo journalctl -u specters -f${NC}  — live logs"
  fi
  echo ""
}

main
