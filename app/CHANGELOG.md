# Changelog

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
