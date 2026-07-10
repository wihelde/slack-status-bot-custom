# Slack Status Bot

Slack Status Bot manages a user's Slack status from automated signals and explicit user actions.

## Language

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
