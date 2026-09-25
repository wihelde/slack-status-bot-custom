# Slack Status Bot - Electron App

Desktop application for automating your Slack status based on music playback, meetings, and custom rules.

## Features

✨ **Multi-Source Status Updates**
- Spotify, Apple Music, and YouTube Music PWA playback tracking
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
- Slack authorization for multiple workspaces
- Per-source enable/disable
- Customizable source priority order
- Auto-start on login

## Installation

### macOS
Download the latest `.dmg` installer from [Releases](https://github.com/yourusername/slack-status-bot/releases)

**Requirements:** macOS 10.13+ (Intel & Apple Silicon)

YouTube Music tracking requires installing [music.youtube.com](https://music.youtube.com/) as a browser app. Ordinary browser tabs are not detected. In a Chromium-based browser, open YouTube Music and choose **Install YouTube Music** or **Install page as app** from the browser menu.

### Windows & Linux
Support coming in future releases.

## Development

### Prerequisites
- Node.js 22.13+ and npm
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
Runs the Vite development server and Electron in watch mode with hot reload.

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

Encrypted Slack connections are stored in `workspace-connections.json` in the same directory. For the private Slack app setup and authorization steps, see [Connect a Slack workspace](../README.md#connect-a-slack-workspace).

## Usage

### Quick Actions
- **Online** - Set online status
- **Away** - Set away status (presence: away)
- **Break** - On break (presence: away)
- **Meeting** - In a meeting (DND enabled)
- **Focus** - Focusing (DND enabled)
- **Holiday** - Vacation mode with return and expiration date

### External Status Commands
The Electron app supports a custom URL scheme for free-form status shortcuts.

For Stream Deck, use **System → Website** and enter the URL itself, not a shell command:

```text
slack-status-bot://set?emoji=:shopping_trolley:&text=Bin%20einkaufen
```

From a terminal, wrap the URL with macOS `open`:

```sh
open "slack-status-bot://set?emoji=:shopping_trolley:&text=Bin%20einkaufen"
```

This is useful for Stream Deck, macOS Shortcuts, Raycast, Alfred, Keyboard Maestro, or shell commands. The command is handled by the Electron app; if the app is not already running, macOS starts it and the app continues running in the background.
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

## Troubleshooting

### Update Notifications
When an update is available, the app shows a native notification in addition to the dashboard and tray menu indicators. On Windows and Linux the notification is requested as persistent; on macOS persistence depends on the notification style configured in System Settings.

### App won't start
- Clear cache: `rm -rf node_modules && npm install`
- Check logs for errors (Settings → Logs tab)

### Status not updating
- Check the workspace connection in Settings → Workspaces
- Verify the source app is running. YouTube Music must run as an installed browser app, not an ordinary tab.
- Check daemon status in Dashboard
- Check logs for errors (Settings → Logs tab)


## Contributing

Issues and pull requests welcome!

## License

MIT

## Release Notes

See [CHANGELOG.md](./CHANGELOG.md) for version history and updates.
