# Slack Status Bot - Electron App

Cross-platform desktop application for automating your Slack status based on music playback, meetings, and custom rules.

## Features

✨ **Multi-Source Status Updates**
- Spotify & Apple Music playback tracking
- Zoom & Microsoft Teams meeting detection
- Slack Huddle detection
- Custom status messages & Holiday status
- Do Not Disturb (DND) integration

🎨 **Intelligent UI**
- Real-time status updates (event-based, not polling)
- Modern, responsive design
- Quick action buttons (Online, Away, Break, Meeting, Focus, Holiday, etc.)
- Source priority management
- Log viewer for debugging

⚙️ **Easy Configuration**
- Slack API token setup (supports multiple tokens)
- Per-source enable/disable
- Customizable source priority order
- System preferences
- Auto-start on login

## Installation

### macOS (Currently Supported)
Download the latest `.dmg` installer from [Releases](https://github.com/yourusername/slack-status-bot/releases)

**Requirements:** macOS 10.13+ (Intel & Apple Silicon)

### Windows & Linux
Support coming in future releases.

## Development

### Prerequisites
- Node.js 18+ and npm
- macOS 10.13+ (for development)

### Setup
```bash
cd app
npm install
```

### Development Mode
```bash
npm run dev
```
Runs React development server + Electron in watch mode with hot reload.

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

Settings are stored in:
- **macOS:** `~/Library/Application Support/slack-status-bot/config.json`

### Config Structure
```json
{
  "slackTokens": ["xoxb-...", "xoxb-..."],
  "sourceOrder": ["spotify", "appleMusic", "zoom", "teams", "huddle"],
  "enabledSources": {
    "spotify": true,
    "appleMusic": true,
    "zoom": true,
    "teams": true,
    "huddle": true
  }
}
```

## Usage

### Quick Actions
- **Online** - Set online status
- **Away** - Set away status (presence: away)
- **Break** - On break (presence: away)
- **Meeting** - In a meeting (DND enabled)
- **Focus** - Focusing (DND enabled)
- **Holiday** - Vacation mode with return date
- **Remeet** - Back from meeting

### Source Priority
Sources are checked in priority order. The first active source's status is displayed:
1. Spotify / Apple Music
2. Zoom meetings
3. Microsoft Teams meetings
4. Slack Huddles

You can reorder these in Settings.

## Troubleshooting

### App won't start
- Clear cache: `rm -rf node_modules && npm install`
- Check console for errors (Settings → Logs tab)

### Status not updating
- Check Slack token in Settings
- Verify source app is running (Spotify, Teams, etc.)
- Check daemon status in Dashboard

### Logs
Access debug logs in Settings → Logs tab. Use log level dropdown to adjust verbosity.

## Contributing

Issues and pull requests welcome!

## License

MIT

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.
