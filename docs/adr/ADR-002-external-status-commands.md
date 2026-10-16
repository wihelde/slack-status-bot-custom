# ADR-002: External Status Commands Use the Electron App as Status Proxy

**Status:** Accepted
**Date:** 2026-07-10
**Author:** Martin

## Context

The project has a legacy shell bot and a newer Electron app. Users still want to trigger status changes from outside the app UI, for example through Stream Deck, keyboard shortcuts, macOS Shortcuts, Raycast, Alfred, or shell commands.

## Decision

External status commands will target the Electron app, not the legacy shell bot. The command sets a free-form Slack status through the app's normal status-setting path, making the Electron app a status proxy for explicit user actions.

The first supported transport will be a custom URL scheme:

```sh
open "slack-status-bot://set?emoji=:shopping_trolley:&text=Einkaufen"
```

Command parameters are URL parameters. Text containing spaces, umlauts, or special characters must be URL-encoded:

```sh
open "slack-status-bot://set?emoji=:shopping_trolley:&text=Bin%20einkaufen"
```

Presence may be set with `presence=away` or `presence=auto`. If omitted, presence defaults to `auto`:

```sh
open "slack-status-bot://set?emoji=:shopping_trolley:&text=Bin%20einkaufen&presence=away"
```

Two special-case commands trigger the existing quick actions instead of setting a free-form status:

```sh
open "slack-status-bot://online"
open "slack-status-bot://offline"
```

`online` delegates to the app's Go Online action. `offline` delegates to the app's Go Away action.

A CLI wrapper may be added later as a convenience layer, but it should delegate to the URL scheme instead of becoming a second status-writing path.

External status commands are allowed to replace the current status, including a protected status. After the status is set, the normal reconciliation rules still apply: if the resulting status is not managed by the app, automation treats it as a custom user status and does not automatically overwrite it.

The app should not mark an external status command as an active source. It is a user-owned Slack status after it has been set, not a long-running activity source like Spotify or Zoom.

External status commands are treated as user-owned even when they use an emoji the app otherwise manages, such as the Focus quick-action emoji. The correction loop and observed source updates must not replace that status until the user explicitly clears or replaces it.

External status commands should show a native notification after the command is executed. Automated source updates should not show these notifications.

Update checks may also show native notifications when an update is available. These are separate from external command feedback.

## Consequences

- Stream Deck and shortcut workflows can set arbitrary emoji/text statuses without keeping the shell bot alive.
- The app remains the single status-writing path for Electron-era workflows.
- Stream Deck, macOS Shortcuts, Raycast, Alfred, and shell commands can trigger the same URL-shaped command.
- Protected statuses still protect against automation, but not against a deliberate external user command.

## Alternatives

### A1: Keep using the legacy shell bot

Rejected because it bypasses the Electron app and keeps two status-writing systems alive.

### A2: Limit external commands to configured quick actions

Rejected because the target workflow is free-form statuses such as `:shopping_trolley:` plus `Einkaufen`, not only predefined app actions.

### A3: Block external commands while protected status is active

Rejected because external commands are explicit user actions, equivalent in authority to dashboard or tray actions.

### A4: Build a dedicated CLI first

Rejected for the first version because it adds packaging and installation surface. A future CLI can remain a thin wrapper over the URL scheme.
