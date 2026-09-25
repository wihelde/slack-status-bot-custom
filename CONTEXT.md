# Slack Status Bot

Slack Status Bot manages a user's Slack status from automated signals and explicit user actions.

## Language

**Slack App Registration**:
The Slack-side app Martin creates separately in each workspace to authorize the desktop app's access. It is distinct from the installed desktop app and from a user's workspace connection.
_Avoid_: Desktop installation, shared Slack login

**Setup Link**:
A reusable link Martin prepares for one Slack app registration so users can start connecting that workspace in the desktop app. It carries registration information, not a user's authorization or credentials.
_Avoid_: Token link, login token

**Workspace Connection**:
The app's authorization to act for a Slack user in one workspace. Each workspace has at most one connection; reconnecting replaces that workspace's connection without changing connections to other workspaces.
_Avoid_: Token slot, global Slack login

**Reconnect**:
A fresh authorization for an existing workspace connection. Only successful authorization replaces that workspace's credentials; cancelling or failing to reconnect does not replace a connection.
_Avoid_: Reset all tokens, reinstall the desktop app

**Shared Status**:
The status the app intends to apply consistently across connected workspaces. Actual workspace statuses may temporarily differ when an update fails or is still pending.
_Avoid_: Independent workspace automation

**Reference Workspace**:
The first reachable connected workspace in the app's stable connection order whose Slack profile informs the shared status rules. Another reachable workspace supplies this reference when an earlier workspace is unavailable.
_Avoid_: Master token, independent workspace policy

**Managed Status**:
A Slack status the app recognizes as part of its own automation, configured quick actions, protected statuses, or source-driven statuses.
_Avoid_: Known status, bot status

**Custom User Status**:
A Slack status chosen by the user that the app does not recognize as a managed status. The app treats it as user-owned and does not automatically overwrite it.
_Avoid_: Unknown status, random status

**External Status Command**:
A user-triggered command from outside the dashboard or tray menu that asks the running Electron app to set a free-form Slack status or trigger a supported quick action. It is an explicit user action and may replace the current status, including a protected status.
_Avoid_: Shell-bot shortcut, external quick action, Stream Deck status

**Status Proxy**:
The role the Electron app plays when it receives an external status command and sets the requested Slack status through the app's normal status-setting path.
_Avoid_: Direct Slack script, shell bot
