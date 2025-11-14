# Slack Status Bot - Electron App

Cross-platform desktop application for automating your Slack status based on music playback, meetings, and custom rules.

## Features

✨ **Multi-Source Status Updates**
- Spotify & Apple Music playback tracking
- Zoom & Microsoft Teams meeting detection
- Slack Huddle detection
- Custom status messages

🎨 **Beautiful UI**
- Modern, responsive design
- Dark mode ready
- Quick action buttons
- Tray icon integration

⚙️ **Easy Configuration**
- Slack API token setup
- Per-source enable/disable
- System preferences
- Auto-start on login

## Installation

### macOS
```bash
brew install slack-status-bot
```
Or download from [Releases](https://github.com/yourusername/slack-status-bot/releases)

### Windows
Download the installer from [Releases](https://github.com/yourusername/slack-status-bot/releases)

### Linux
```bash
# AppImage
./slack-status-bot-x.x.x.AppImage

# Or via .deb
sudo apt install ./slack-status-bot_x.x.x_amd64.deb
```

## Development

### Prerequisites
- Node.js 16+ and npm
- macOS 10.13+, Windows 7+, or Ubuntu 18.04+

### Setup
```bash
cd app
npm install
```

### Development Mode
```bash
npm run dev
```
Runs React development server (port 3000) and Electron in watch mode.

### Build
```bash
npm run build
```
Creates optimized production build and packages for distribution.

### Testing
```bash
npm test
```

## Configuration

Settings are stored in `~/.config/slack-status-bot/config.json`

### Example Config
```json
{
  "slackToken": "xoxb-...",
  "enableSpotify": true,
  "enableAppleMusic": true,
  "enableZoom": true,
  "enableMicrosoftTeams": true,
  "enableSlackHuddle": true,
  "enableFocusSwitch": true,
  "autoStart": true
}
```

## Tray Icon

Right-click the tray icon for quick access to:
- Toggle app window
- Quick status changes
- Quick actions (Break, Meeting, Focus, etc.)
- Quit

## Architecture

See [docs/app-architecture.md](../docs/app-architecture.md) for detailed architecture documentation.

## Troubleshooting

### App won't start
- Check that Node.js is installed: `node --version`
- Clear cache: `rm -rf node_modules package-lock.json && npm install`

### Slack API errors
- Verify token in Settings page
- Check token has required scopes in Slack workspace

### Source detection not working
- Ensure source app is running (Spotify, Teams, etc.)
- Check system permissions for app to access running processes

## Contributing

Issues and pull requests welcome!

## License

MIT



