# Deprecated Bash Bot

This directory archives the original Bash version of Slack Status Bot. It is no
longer maintained or run in CI. Use the [Electron app](../README.md) instead.

The shell entry points, `includes/` and Bats tests retain their relative layout.
Shared emoji images remain in [`emojis/`](../emojis/) at the repository root.
Any existing local `.token` and `logs/` files move here as well and remain ignored
by Git. The Electron app does not use these files.

Old launch agents, scheduled jobs and shortcuts pointing to the former root-level
scripts must be disabled when switching to the Electron app. Existing URL shortcuts
such as `slack-status-bot://online` continue to work with the desktop app.

To inspect the archived tests without contacting Slack, run from the repository root:

```sh
bats deprecated/tests
```
