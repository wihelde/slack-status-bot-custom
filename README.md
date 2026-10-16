# Slack Status Bot - Electron App

Desktop application for automating your Slack status based on music playback, meetings, and custom rules.

## Installation

### macOS (Currently Supported)
Download the latest `.dmg` installer from [Releases](https://gitlab.com/wihel_de/slack-status-bot-custom/-/releases)
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
- Slack authorization for multiple workspaces
- Per-source enable/disable
- Customizable source priority order
- Auto-start on login

## Development

### Prerequisites
- Node.js 22.22.2 (the CI version) and npm 12.1.0
- macOS 10.13+ (for development)

### Setup
```bash
project_npm_version=$(node -p 'require("./package.json").engines.npm')
npx --yes "npm@$project_npm_version" install --global "npm@$project_npm_version"
npm ci
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

Each test prints its result with a checkmark when it passes. Deliberately triggered
errors are checked and labelled `[Erwarteter Fehler geprüft]`; expected warnings
use `[Erwarteter Hinweis geprüft]`. Other warnings and errors remain visible.
Error-case tests use `src/__tests__/helpers/expectedConsole.ts` to check their
specific messages. A missing expected message or an additional message fails
that test. Routine `console.log` progress is hidden so the results stay readable.

Merge-request pipelines run `npm run test:coverage` and `npm run package:smoke`
on Linux with Xvfb and an isolated D-Bus/GNOME keyring session. The package check builds the app, verifies its ASAR and updater
configuration, starts the packaged executable, and checks rendered UI, IPC and
persisted settings using an empty temporary profile. No release is published.

The npm version is pinned in `package.json` under `engines.npm`. CI installs that
version explicitly, Renovate uses it for lockfile updates, and `.npmrc` rejects
installs with a different version. This prevents optional peer entries from being
removed by one npm version and required by another. Update `engines.npm` when
upgrading npm; the CI image's bundled npm version does not determine it.

Before merging dependency updates, run this on macOS:

```bash
npm run macos:smoke
```

This creates temporary unsigned DMG/ZIP artifacts, verifies their integrity and
URI registration, starts the macOS app, and checks real AppleScript, process and
MediaRemote probes plus encrypted workspace migration with dummy credentials.
These macOS checks run locally because the project has no macOS CI runner.
They do not test visible notifications, live playback in third-party apps,
signed releases or an installed app's update flow.

## Legacy Bash Version

The Electron app lives at the repository root and is the maintained version.
The former Bash bot, its helpers and tests are archived in
[`deprecated/`](deprecated/README.md). The Bash version is no longer maintained
or run in CI.

## Configuration

Settings are stored in:
- **macOS:** `~/Library/Application Support/slack-status-bot/config.json`

Slack connections are stored separately in `workspace-connections.json` in the same directory. Access and refresh tokens are encrypted using macOS secure storage; they are not shown as plain text in the settings file. Existing tokens in `config.json` are migrated automatically.

### Connect a Slack workspace

An administrator sets up a private Slack app for each workspace. Users only need the Setup Link; they do not need the Slack Client ID or a Client Secret.

1. In the [Slack app settings](https://api.slack.com/apps), create the app for the workspace. Copy its **Client ID** from **Basic Information → App Credentials**.
2. Under **OAuth & Permissions**, enable **PKCE**, add `slack-status-bot://oauth` as a Redirect URL, and grant these **User Token Scopes**: `users.profile:read`, `users.profile:write`, `users:write`, `dnd:write`. See [Slack's PKCE guide](https://docs.slack.dev/authentication/using-pkce/) for the Slack settings.
3. In the desktop app, open **Settings → Workspaces → Create Setup Link**. Enter the Client ID and optionally the workspace ID (`T...`) to restrict the link to that workspace. Generate and share the link with the user. Do not enter an app ID (`A...`) as the workspace ID.
4. The user opens the Setup Link, or pastes it into **Settings → Workspaces → Setup Link** and selects **Connect workspace**. They approve access in the browser and allow it to reopen the desktop app. The workspace then appears under **Settings → Workspaces**.

Repeat with a separate Slack app and Setup Link for each workspace. Connecting or reconnecting a workspace replaces only that workspace's credentials. Other workspace connections are unaffected. New connections renew their tokens automatically; use **Reconnect** if authorization is needed again. A migrated connection may need its Setup Link for the first reconnect.

If Slack reports that the redirect URI does not match, check that the app's Redirect URL is exactly `slack-status-bot://oauth`. If the browser does not return to the desktop app, allow the browser prompt to open **Slack Status Bot** and check the message under **Settings → Workspaces**.

#### Example manifest for easy copy & paste

```yaml
display_information:
  name: Slack Status Updater
  description: Simple app to generate a token to change your Slack-status via the Slack Status Bot
  background_color: "#2c2d30"
oauth_config:
  redirect_urls:
    - slack-status-bot://oauth
  scopes:
    user:
      - dnd:read
      - dnd:write
      - reactions:read
      - users.profile:read
      - users.profile:write
      - users:read
      - users:write
  pkce_enabled: true
settings:
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
  app_level_token_rotation_enabled: false
  is_mcp_enabled: false
```

### Config Structure
```json
{
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

### Missing Slack-Emojis
In case the status is not changed due to a unknown slack-emoji in your workspace, you can check the emojis-folder and upload the missing ones from there.

## License

You may use and modify Fahrtenbuch for your own private or business trips. Versions shared with others must be free of charge and include access to their source code under the same terms. Selling the software, charging for access or hosting, and incorporating it into paid products or services are prohibited.

## Release Notes

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.
