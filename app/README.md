# Slack Status Bot - Electron App

Desktop application for automating your Slack status based on music playback, meetings, and custom rules.

## Features

✨ **Multi-Source Status Updates**
- Spotify & Apple Music playback tracking
- Zoom & Microsoft Teams meeting detection
- Slack Huddle detection
- Custom status messages & Holiday status
- Do Not Disturb (DND) integration

🎨 **UI**
- Real-time status updates
- Quick action buttons (Online, Away, Break, Meeting, Focus, Holiday, etc.)
- Source management + priority settings
- Log viewer for debugging

⚙️ **Easy Configuration**
- Slack API token setup (supports multiple tokens)
- Per-source enable/disable
- Customizable source priority order
- Auto-start on login

## Installation

### macOS
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
Creates production build and packages for distribution.

### Testing
```bash
npm test
```

## Configuration

Settings are stored in:
- **macOS:** `~/Library/Application Support/slack-status-bot/config.json`


## Usage

### Quick Actions
- **Online** - Set online status
- **Away** - Set away status (presence: away)
- **Break** - On break (presence: away)
- **Meeting** - In a meeting (DND enabled)
- **Focus** - Focusing (DND enabled)
- **Holiday** - Vacation mode with return and expiration date

## Troubleshooting

### App won't start
- Clear cache: `rm -rf node_modules && npm install`
- Check logs for errors (Settings → Logs tab)

### Status not updating
- Check Slack token in Settings
- Verify source app is running (Spotify, Teams, etc.)
- Check daemon status in Dashboard
- Check logs for errors (Settings → Logs tab)


## Contributing

Issues and pull requests welcome!

## License

MIT

## Release Notes

See [CHANGELOG.md](./CHANGELOG.md) for version history and updates.



