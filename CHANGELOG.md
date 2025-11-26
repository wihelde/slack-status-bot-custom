# Changelog

All notable changes to the Slack Status Bot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Event-based status updates architecture
- Clear logs button in debug logs viewer
- Improved logging and debugging capabilities

### Changed
- Dashboard status updates now use event listeners instead of polling
- Slack API polling reduced to only critical operations

### Fixed
- UI lag when sources become active
- Status not syncing immediately in UI
- Slack API call inefficiency from excessive polling

---

## [1.1.9] - 2025-11-25

### Added
- Event-based status update system for real-time UI synchronization
- Clear logs functionality in Settings → Logs tab
- Additional debug logging for status change events
- Source activity tracking in statusCheckState

### Fixed
- UI lag when Spotify or other sources become active
- Excessive Slack API polling reducing performance
- Status changes not reflected immediately in Dashboard
- Missing event emissions when sources update status

### Changed
- Dashboard polling interval changed from 2 seconds to event-based
- Status updates now propagate instantly via IPC events
- Daemon emits statusChanged events on all status modifications
- Improved performance by reducing unnecessary API calls

### Performance
- Reduced Slack API calls by ~95% during idle periods
- Event-based updates provide instant UI feedback
- Daemon background polling remains efficient (1 second intervals for local sources)

---

## [1.1.0] - 2025-11-20

### Added
- Holiday status with date-based expiration
- Presence status management (away/auto)
- DND (Do Not Disturb) control for meetings
- Reset cooldown to prevent repeated failed attempts
- Active source tracking in status check state
- Proper status blocking when user has set custom status

### Fixed
- Status reset blocked but retried infinitely
- DND changes triggered even when status couldn't be changed
- Mobile phone off emoji being overridden automatically
- Presence status inconsistency across different quick actions
- Holiday expiration date calculation (off by one day)

### Changed
- Presence logic aligned with different status types (away vs auto)
- Status messages updated ("On vacation" → "strong vacationing")
- Reset attempt cooldown set to 30 seconds when blocked
- Improved status checking logic (isStatusClean)

---

## [1.0.0] - 2025-11-01

### Added
- Initial release of Slack Status Bot Electron app
- Multi-source status tracking:
  - Spotify playback detection
  - Apple Music playback detection
  - Zoom meeting detection
  - Microsoft Teams meeting detection
  - Slack Huddle detection
- Dashboard with real-time source status display
- Quick action buttons (Online, Away, Break, Meeting, Focus, Remeet)
- Settings page for:
  - Slack API token configuration
  - Source enable/disable toggle
  - Source priority reordering
  - Log viewer with refresh and copy functionality
- Daemon background process for continuous monitoring
- Status Manager for intelligent status logic
- Multiple Slack token support
- Configuration persistence
- Tray icon integration
- Auto-start capability
- Debug logging system
- Unit tests for core functionality

### Features
- Real-time Slack status updates
- Do Not Disturb (DND) for meetings
- Online/Away presence management
- Custom status messages
- Source priority system
- Configuration auto-save

---

## Version History

| Version | Date | Notes |
|---------|------|-------|
| 1.1.9 | Nov 25, 2025 | Event-based updates, performance improvements |
| 1.1.0 | Nov 20, 2025 | Holiday status, presence management, bug fixes |
| 1.0.0 | Nov 01, 2025 | Initial release |

