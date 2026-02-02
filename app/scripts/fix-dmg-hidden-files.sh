#!/bin/bash
# Post-build script to move hidden files outside visible area in DMG
# This fixes an issue where .background.png and .VolumeIcon.icns are visible

set -e

DMG_PATH="$1"

if [ -z "$DMG_PATH" ]; then
    echo "Usage: $0 <path-to-dmg>"
    exit 1
fi

if [ ! -f "$DMG_PATH" ]; then
    echo "Error: DMG file not found: $DMG_PATH"
    exit 1
fi

echo "🔧 Fixing hidden files in DMG: $DMG_PATH"

# Create temp directory for work
WORK_DIR=$(mktemp -d)
RW_DMG="$WORK_DIR/rw.dmg"
MOUNT_POINT="$WORK_DIR/mount"

cleanup() {
    echo "🧹 Cleaning up..."
    # Unmount if still mounted
    if [ -d "$MOUNT_POINT" ]; then
        hdiutil detach "$MOUNT_POINT" -force 2>/dev/null || true
    fi
    # Remove temp directory
    rm -rf "$WORK_DIR"
}

trap cleanup EXIT

# Step 1: Convert to read-write
echo "📦 Converting DMG to read-write..."
hdiutil convert "$DMG_PATH" -format UDRW -o "$RW_DMG"

# Step 2: Mount the read-write DMG
echo "📂 Mounting DMG..."
mkdir -p "$MOUNT_POINT"
hdiutil attach "$RW_DMG" -mountpoint "$MOUNT_POINT" -nobrowse

# Step 3: Get volume name
VOLUME_NAME=$(basename "$MOUNT_POINT")

# Step 4: Move hidden files outside visible area using AppleScript
echo "🔄 Moving hidden files outside visible area..."

osascript <<EOF
tell application "Finder"
    tell disk "$VOLUME_NAME"
        open
        set current view of container window to icon view
        set opts to the icon view options of container window
        
        -- Try to position hidden files outside visible area
        try
            set position of item ".background.png" to {9999, 9999}
        end try
        try
            set position of item ".VolumeIcon.icns" to {9999, 9999}
        end try
        try
            set position of item ".DS_Store" to {9999, 9999}
        end try
        
        close
    end tell
end tell
EOF

# Give Finder time to write changes
sleep 2

# Step 5: Unmount
echo "⏏️  Unmounting DMG..."
hdiutil detach "$MOUNT_POINT"

# Step 6: Convert back to read-only compressed
echo "📦 Converting back to read-only compressed DMG..."
rm -f "$DMG_PATH"
hdiutil convert "$RW_DMG" -format UDZO -o "$DMG_PATH"

echo "✅ Done! Hidden files are now positioned outside visible area."
