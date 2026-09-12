# Slack Status Bot - Electron App

Desktop application for automating your Slack status based on music playback, meetings, and custom rules.

## Installation

### macOS (Currently Supported)
Download the latest `.dmg` installer from [Releases](https://github.com/yourusername/slack-status-bot/releases)
Move the app to your applications-folder
Open your terminal and execute the following command: 

`xattr -dr com.apple.quarantine /Applications/Slack\ Status\ Bot.app`

## Features

**Multi-Source Status Updates**
- Spotify, Apple Music, and YouTube Music PWA playback tracking
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

## Configuration

Settings are stored in:
- **macOS:** `~/Library/Application Support/slack-status-bot/config.json`

### Config Structure
```json
{
  "slackTokens": ["xoxb-...", "xoxb-..."],
  "sourceOrder": ["spotify", "appleMusic", "youtubeMusic", "zoom", "teams", "huddle"],
  "enabledSources": {
    "spotify": true,
    "appleMusic": true,
    "youtubeMusic": true,
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

### External Status Commands
You can set a free-form status from Stream Deck, macOS Shortcuts, Raycast, Alfred, Keyboard Maestro, or a shell command by opening the app URL scheme.

For Stream Deck, use **System → Website** and enter the URL itself, not a shell command:

```text
slack-status-bot://set?emoji=:shopping_trolley:&text=Bin%20einkaufen
```

From a terminal, wrap the URL with macOS `open`:

```sh
open "slack-status-bot://set?emoji=:shopping_trolley:&text=Bin%20einkaufen"
```

The app receives the command and sets the status through the Electron app, not through the legacy shell bot. If the app is not running, macOS starts it and the app keeps running in the background.
External commands show a native notification after the app has handled them.

Parameters:
- `emoji` - Slack emoji code, for example `:shopping_trolley:`
- `text` - Status text; URL-encode spaces and special characters
- `presence` - Optional Slack presence, either `auto` or `away`; defaults to `auto`

Example for an away status:

```sh
open "slack-status-bot://set?emoji=:shopping_trolley:&text=Bin%20einkaufen&presence=away"
```

Online and offline can be triggered through the existing quick actions:

```text
slack-status-bot://online
slack-status-bot://offline
```

`online` runs the app's **Go Online** action. `offline` runs the app's **Go Away** action.

### Source Priority
Sources are checked in priority order. The first active source's status is displayed:
1. Spotify / Apple Music / YouTube Music
2. Zoom meetings
3. Microsoft Teams meetings
4. Slack Huddles

You can reorder these in Settings.

YouTube Music tracking requires installing [music.youtube.com](https://music.youtube.com/) as a browser app. Ordinary browser tabs are not detected. In a Chromium-based browser, open YouTube Music and choose **Install YouTube Music** or **Install page as app** from the browser menu.

## Troubleshooting

### Update Notifications
When an update is available, the app shows a native notification in addition to the dashboard and tray menu indicators. On Windows and Linux the notification is requested as persistent; on macOS persistence depends on the notification style configured in System Settings.

### Logs
Access debug logs in Settings → Logs tab. Use log level dropdown to adjust verbosity.

## License

MIT

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.
