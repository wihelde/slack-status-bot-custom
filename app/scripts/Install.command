#!/bin/bash

# Get the directory where this script is located (the mounted DMG)
DMG_MOUNT=$(cd "$(dirname "$0")" && pwd)
APP="$DMG_MOUNT/Slack Status Bot.app"

echo "Installing Slack Status Bot..."

# Check if app exists
if [ ! -d "$APP" ]; then
  echo "❌ Error: Slack Status Bot.app not found"
  exit 1
fi

# CRITICAL: Fix permissions on the SOURCE app (on DMG) before copying
echo "🔧 Preparing source app..."
find "$APP" -type d -exec chmod u+w,a+rx {} \; 2>/dev/null || true
find "$APP" -type f -exec chmod u+w {} \; 2>/dev/null || true

INSTALL_DIR="/Applications"

echo "📍 Installing to: $INSTALL_DIR"

# Remove existing app if present
if [ -d "$INSTALL_DIR/Slack Status Bot.app" ]; then
  echo "🗑️  Removing old installation..."
  sudo rm -rf "$INSTALL_DIR/Slack Status Bot.app" || {
    echo "❌ Error: Could not remove old installation"
    exit 1
  }
fi

# Copy to Applications
echo "📋 Copying app..."
sudo cp -rPp "$APP" "$INSTALL_DIR/" || {
  echo "❌ Error: Could not copy app"
  exit 1
}

# Remove quarantine attribute from the new copy
echo "🔓 Removing quarantine attribute..."
sudo xattr -dr com.apple.quarantine "$INSTALL_DIR/Slack Status Bot.app" 2>/dev/null || true

# Make it executable
sudo chmod +x "$INSTALL_DIR/Slack Status Bot.app/Contents/MacOS/Slack Status Bot" 2>/dev/null || true

echo "✅ Installation complete!"
echo "🚀 Starting Slack Status Bot..."

# Launch the app
open "$INSTALL_DIR/Slack Status Bot.app"

exit 0
