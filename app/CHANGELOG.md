# Changelog

## [2.3.3] - 2026-10-04

## Fixed

- automatic resets no longer undo a manual Offline action when status updates overlap
- manually selected quick-action statuses, including offline meetings, are no longer overwritten by music or meeting sources; selecting Online resumes automation

## [2.3.0.2] - 2026-09-26

## Changed

- more UI-changes for more consistency

## [2.3.0.1] - 2026-09-25

## Fixed

- restored offline as protected status


## [2.3.0] - 2026-09-25

## Added

- Slack workspaces can now be connected directly through the desktop app with a Setup Link and browser authorization; the separate authorization page is no longer needed
- Slack connections are stored per workspace with encrypted credentials and automatic token renewal; existing tokens are migrated automatically
- Settings now offers System, Light, and Dark appearance modes

## Changed

- connecting or reconnecting a workspace replaces only that workspace's credentials
- redesigned the Dashboard and Settings pages for clearer workspace and status information

## Fixed

- external status commands once again show visible and audible notifications on macOS

## [2.2.1] - 2026-09-12

## Added

- offline status messages can now be added, edited, and deleted in Settings

## Fixed

- unreadable configuration files are preserved as a backup instead of being silently replaced with empty settings
- the app now shows an error when it cannot read the configuration

## [2.2.0] - 2026-09-12

## Added

- YouTube Music can now update the Slack status when it is played through an installed macOS PWA
- YouTube Music appears as a configurable source with the `:youtube-music:` Slack emoji

## Changed

- updated Electron and replaced the legacy frontend build tooling to resolve all reported dependency vulnerabilities
- the Support link in Settings now opens an email to `slackbot@wihel.de`

## Fixed

- changing tracks in YouTube Music no longer briefly marks the source as inactive

## [2.1.1] - 2026-09-02

## Fixed

- in rare cases it could happen that the bot updates the status, but the changed status is not reflected in slack -> fixed by a single check after the update happened to validate and / or do a retry
- external online commands now update Slack presence even if a profile status fails in one workspace
- protected statuses such as Sick are now restored after restarting the app instead of being replaced by the status of the day
- failed Slack profile requests are retried once and no longer allow automatic sources to overwrite a protected status; status correction retries with a fresh profile after 60 seconds instead of using stale cached data

## [2.1.0] - 2026-07-10

## Added

- added external status commands via the `slack-status-bot://` URL scheme, so shortcuts, Stream Deck, Raycast, Alfred or macOS Shortcuts can set a status through the Electron app
- external commands can set free-form emoji/text statuses and optionally set Slack presence with `presence=auto` or `presence=away`
- added special external commands for the existing quick actions: `slack-status-bot://online` and `slack-status-bot://offline`
- external commands now show native notifications after they were handled
- update checks now show a native notification when a newer version is available

## [2.0.2] - 2026-07-02

## Fixed

- fixed detection of Microsoft Teams Meetings

## [2.0.1] - 2026-06-16

## Changed

- the correction-mechanism was skipping when the current slack-status was empty, which could prevent the application of the "status of the day" - now it checks also this case, respects changes (= deletion of the status in slack) in the last 10 minutes and correct the status if a "status of the day" is configured
- the frontend now shows the correct app-version

## Fixed

- it could happen that a alreaday set holiday-status was reverted when your local machine was restarted - now the bot checks after startup which status is set in slack and tries to recreate its internal status based on it (if needed, e.g. you are still on holiday)
- some internal code-optimization

## [2.0.0] - 2024-04-21

This one is a bigger refactoring to clean up the code, change ownership and responsibilities regarding functions within the bot. Nothing which can be seen using the bot, but helping further development and making it easier to understand whats going on within the code. So in essence: reduce complexity for all functions and depdendencies (e.g. when is a change allowed, when should the status be kept etc.) Therefore no detailed change-list this time.

## [1.4.9] - 2026-03-07

## Fixed

- adjusted dmg-build, so that the background-image in the dmg is shown (again)
- holiday-status was changed when music was started
- improved logic regarding holiday-expiration

## [1.4.8] - 2026-01-31

## Fixed

- there was some race condition when a source became inactive and the automatic status correction ran at the same time

## [1.4.7] - 2026-01-27

## Changed

- sections in Settings -> Status Configuration can now be fold and unfold
- without a token the source-toggles were not usable - its now indicated and shows a hint to first set up a token


## Fixed

- auto-start was not checking existing launchAgents which could end up in a missleading state

## [1.4.6] - 2026-01-26

## Fixed

- in some cases two instances were started when you reboot your machine
- logs now use auto-scroll in the correct way
- away-status is now "secured" and will not be changed by the automatic status-correction (runs every 60 seconds)

## [1.4.5] - 2021-01-25

## Fixed

- found some use-case where the override-feature introduced in 1.4.3 was not working as expected
- the page to get the users-token has been opened inside the app, which lead to a "this browser is not supported"-message

## [1.4.4] - 2026-01-21

## Fixed

- it could happen that two icons were shown in the menu-bar, even just one process is running

## [1.4.3] - 2026-01-20

## Added

- new option to overwrite specific emoji + status-message, e.g. set bei another slack-app
  - the configuration can be edited under ~/Library/Application\ Support/slack-status-bot/config.js

## Fixed

- when using multiple tokens, there were rare cases where the Slack API responded with a 429 and the status was not changed -> Multi-token requests are now sent sequentially with a slight delay.

## [1.4.2] - 2026-01-15

## Changed

- updated packages

## Fixed

- when updating the app, the default status were merged with the status already configured in the config, which in the end showed a wrong configuration (by showing default status, which were not configured)

## [1.4.1] - 2026-01-13

## Added

- removed the special handling for weekends, because the user can now take care if it by setting status especially for the weekend
- update check - the app checks now for new updates and informs the user about it
- added tests

## Changed

- changed tests

## [1.4.0] - 2026-01-09

## Added

- Autostart-setting via Launch Agent
- you can now minimize the App and its still usable via menu-item at the top of your screen

## Changed

- fixed one wrong test which broke in v1.3.0

## [1.3.0] - 2026-01-09

### Added

- possibility to define own custom status
- possibility to change icons and message for quick-actions
- new tests

## [1.2.4] - 

### Fixed

- status was not changed when song was changed, but Spotify and Apple Music just continued playing

## [1.2.3] - 2025-12-02

### Fixed

-Sources were not de- or activated when clicking the toggle in the UI
- in rare cases the DND-mode was not activated when switching too quickly between meetings

### Changed

- adjusted tests

## [1.2.2] - 2025-11-28

### Changed

- Preview for setting holiday was showing misleading information

## [1.2.1] - 2025-11-27

### Fixed

- Sources in the UI were not updated when they became active (and later inactive again)

## [1.2.0] - 2025-11-25

### Added
- Event-based status updates
- Clear logs button in debug logs viewer

### Changed
- Dashboard status updates now use event listeners instead of polling
- Slack API polling reduced to only critical operations
  - before status-reset to check if status is allowed to change
  - correctStatus in case reset has not wokred as expected

---

## [1.1.0] - 2025-11-20

### Added
- Holiday status with date-based expiration

### Fixed
- Proper status blocking when user has set custom status
- DND (Do Not Disturb) control for meetings
- Presence status management (away/auto)
- Status reset blocked but retried infinitely
- DND changes triggered even when status couldn't be changed
- Presence status inconsistency across different quick actions
- Holiday expiration date calculation (off by one day)

---

## [1.0.0] - 2025-11-01

### Added
- Initial release of Slack Status Bot app based on previous bash-version
- bash-version is still in place and can be used as fallback
- additionally you can use shell-commands for time-based events or manual changes, e.g. by pressing a button on your stream deck
