# Slack Status Bot - Electron App

Desktop application for automating your Slack status based on music playback, meetings, and custom rules.

## Features

**Multi-Source Status Updates**
- Spotify & Apple Music playback tracking
- Zoom & Microsoft Teams meeting detection
- Slack Huddle detection
- Custom status messages & Holiday status
- Do Not Disturb (DND) integration
- status-correction runs every 60 seconds and checks if correction is needed

**UI**
- Real-time status updates (event-based, not polling)
- responsive design
- Quick action buttons
- Source priority management

**Easy Configuration**
- Slack API token setup (supports multiple tokens)
- Per-source enable/disable
- Customizable source priority order
- Auto-start on login

## Installation

### macOS (Currently Supported)
Download the latest `.dmg` installer from [Releases](https://github.com/yourusername/slack-status-bot/releases)

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

### Logs
Access debug logs in Settings → Logs tab. Use log level dropdown to adjust verbosity.

## License

MIT

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.
