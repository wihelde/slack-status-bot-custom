# Architecture Documentation

## Overview

The Slack Status Bot is a daemon that automatically manages your Slack status based on multiple sources and user preferences. It integrates with:
- **Music services** (Spotify, Apple Music) for now-playing updates
- **Meeting services** (Zoom, Teams, Huddle) for in-meeting status
- **Day-based statuses** (Monday, Friday, etc.)
- **Manual quick actions** (Break, Focus, Holiday, Off, etc.)

The bot runs as a background daemon with an Electron dashboard UI for manual control.

## Core Concepts

### StatusCheckState

The most critical concept in this codebase. It tracks TWO important pieces of information:

```typescript
interface StatusCheckState {
  value: 'not working' | '';           // The protection mode
  activeSource?: string;                 // Which source is currently active
  expirationTime?: number;               // (Optional) Unix timestamp for expiring statuses
}
```

### The Two Modes: `'not working'` vs `''`

#### `statusCheckState.value = ''` (Normal Mode)
- Bot can freely change status based on:
  - Active music/meeting sources
  - Day-based configurations
  - Polling updates
- Sources have priority (Spotify > Apple Music > Zoom > Teams > Huddle)
- The user can change the priority of this order

#### `statusCheckState.value = 'not working'` (Protected Mode)
- **CRITICAL**: When this is active, the bot **MUST NOT** change the status automatically
- Set by these **Protected Statuses**:
  - `:palm_tree:` Holiday
  - `:face_with_thermometer:` Sick
  - `:mobile_phone_off:` Off
  - `:baby:` Parental Leave
- The status stays locked until the user manually clears it (e.g., via `goOnline()`) or the expiration passes

### activeSource

Tracks which source currently wants to set the status:
- `undefined` = No active source
- `'spotify'` = Spotify is playing music
- `'zoom'` = In a Zoom meeting
- `'manual'` = User manually set a status
- etc.

**Why it matters**: `correctStatus()` skips correction if a source is active (Line 360 in statusManager.ts)

### Protected Statuses & Expiration

Only **Holiday** has automatic Slack-side expiration:
- **Holiday**: Set via Dashboard → `setHoliday(returnDate)` → Slack API with `status_expiration`
- Other protected statuses (Sick, Off, Parental Leave) are not exposed in the Dashboard, so users cannot set them

The bot uses Slack's `status_expiration` field as the source of truth. When the expiration passes, Slack automatically clears the status, and the bot detects this in `correctStatus()`.

## Critical Flows

### Flow 1: Setting Holiday Status (User Action)

```
User clicks "Holiday" in Dashboard
  ↓
ipcService.setHoliday(returnDate)
  ↓
daemon.setHoliday("09.03.2026")
  ↓
statusManager.setHoliday()
  ↓
setCustomStatus(HOLIDAY_EMOJI, message, expirationTimestamp)
  ↓
slackService.setProfile(emoji, message, expirationTimestamp)  ← Sent to Slack API
  ↓
statusCheckState.value = 'not working'  ← CRITICAL: Protect the status!
statusCheckState.activeSource = 'manual'
```

**CRITICAL STATE**: Now `statusCheckState.value === 'not working'`

### Flow 2: Spotify Starts (Polling Detection)

```
Spotify starts playing music
  ↓
polling cycle detects: spotify.isActive = true
  ↓
polling calls: isStatusClean()
  ↓
isStatusClean() checks:
  1. Get current profile from Slack
  2. Check if overridable third-party status
  3. >>> IF statusCheckState.value === 'not working' <<<
  4.     >>> CHECK IF EMOJI IS MANAGED <<<
  5.     >>> IF YES → return FALSE (BLOCK!) <<<
  6. ... rest of checks
  ↓
isStatusClean() returns FALSE ✓
  ↓
polling respects this: "spotify became active but status is not clean, skipping"
  ↓
Holiday status STAYS PROTECTED ✓
```

**KEY**: The `'not working'` check (step 3) must come BEFORE `allowedEmojis` check. This was the bug in the original code!

### Flow 3: Spotify Stops (Reset Detection)

```
Spotify stops playing
  ↓
polling detects: spotify.isActive = false
  ↓
polling calls: statusManager.reset()
  ↓
reset() calls: performReset()
  ↓
performReset() checks:
  1. >>> IF statusCheckState.value === 'not working' <<<
  2. >>> return FALSE (BLOCK!) <<<
  3. ... rest would set empty/day-based status
  ↓
performReset() returns FALSE ✓
  ↓
Holiday status STAYS PROTECTED ✓
```

**KEY**: The `'not working'` check MUST be at the START of `performReset()`. It was missing there, which caused the original bug!

### Flow 4: Holiday Expiration Ends (Auto-Detection)

```
Day passes, Holiday expiration timestamp reached
  ↓
Slack automatically deletes the status
  ↓
correctStatus() polling cycle runs (every 60 seconds)
  ↓
correctStatus() checks:
  1. IF statusCheckState.value === 'not working' AND emoji === HOLIDAY_EMOJI
  2. Check profile.status_expiration from Slack API
  3. IF expiration <= now
  4.     statusCheckState.value = ''  ← AUTO-CLEAR!
  5.     statusCheckState.activeSource = undefined
  6. Continue with normal correctStatus logic
  ↓
statusCheckState now = 'not working' mode is OFF ✓
  ↓
Next polling cycle can set music/day-based status normally ✓
```

**KEY**: Uses Slack API's `status_expiration` as source of truth. No local timer needed!

## The isStatusClean() Decision Tree

**CRITICAL**: The order of checks matters!

```
async isStatusClean(): Promise<boolean> {
  1. Get current profile from Slack
  
  2. Check if overridable third-party (e.g., Officely)
     → YES: return TRUE (we can override)
  
  3. Define managedEmojis (Spotify, Holiday, Sick, etc.)
  
  4. >>> IF statusCheckState.value === 'not working' <<<  ← FIRST CHECK
     → If current emoji IS managed: return FALSE (BLOCK!)
     → If empty status: return TRUE (allow)
  
  5. IF emoji in allowedEmojis: return TRUE
  
  6. IF emoji is a managed emoji: return TRUE
  
  7. ... other checks
  
  return FALSE (unknown custom status)
}
```

**Why this order matters**: 
- Old code checked `allowedEmojis` BEFORE `'not working'`
- Result: Holiday emoji (which is in `allowedEmojis`) was allowed to be changed even in `'not working'` mode
- Fix: Check `'not working'` protection FIRST, before any other allowances

## The performReset() Protection

```
async performReset(): Promise<boolean> {
  1. >>> IF statusCheckState.value === 'not working' <<<  ← MUST BE FIRST!
     >>> return FALSE (BLOCK!) <<<
  
  2. Get day-based status for today
  
  3. IF no status for today: set empty status
  
  4. Check isStatusClean() for whether we're allowed
  
  5. Set the status
}
```

**Why this matters**:
- Old code skipped this check, so `reset()` could clear Holiday status when Spotify stopped
- Fix: Add protection at the START, before any status-setting logic

## Fallstricke (Common Mistakes)

### ❌ Mistake 1: Forgetting `'not working'` check in a new method
If you add a new method that sets status (e.g., `setSomethingCustom()`), you MUST:
```typescript
if (this.statusCheckState.value === 'not working') {
  logger.warn('Cannot set status: protected mode active');
  return false;
}
```

### ❌ Mistake 2: Checking `'not working'` AFTER other allowances
```typescript
// WRONG:
if (this.allowedEmojis.has(emoji)) return true;  // Too early!
if (this.statusCheckState.value === 'not working') return false;  // Too late!

// CORRECT:
if (this.statusCheckState.value === 'not working') return false;  // First!
if (this.allowedEmojis.has(emoji)) return true;
```

### ❌ Mistake 3: Not invalidating profile cache after manual status change
When user sets Holiday, we invalidate the cache so next polling cycle gets fresh data:
```typescript
this.invalidateProfileCache();  // MUST DO THIS!
```

### ❌ Mistake 4: Forgetting to set `activeSource = 'manual'` for manual actions
When user manually sets a status, we mark it:
```typescript
this.statusCheckState.activeSource = 'manual';
```
This prevents `correctStatus()` from overriding it.

## Key Files

- **statusManager.ts**: Core status logic, state management, critical flows
- **slack.ts**: Slack API wrapper, includes `status_expiration` field
- **daemon.ts**: Polling loops, source detection, daemon orchestration
- **ipcService.ts**: Frontend → Backend communication (dashboard)
- **electron.js**: Electron main process, IPC handlers

## Testing Strategy

All critical flows have test coverage in `statusManager.test.ts`:
- Holiday protection when Spotify active
- Holiday protection when reset triggered
- Expiration handling
- State transitions
- Day-based status corrections

Run: `npm test -- statusManager.test.ts`

## Document Maintenance

This ARCHITECTURE.md currently focuses on:
- StatusCheckState and the 'not working' protection mode
- Holiday Status Protection (the critical bug fix from 2026-03-07)
- Key decision trees (isStatusClean, performReset, correctStatus)

When new features or complex flows are added, expand this document with:
- New polling sources or changes to source priority
- Changes to the status management system
- IPC protocol changes
- Config/persistence changes
- Updates to the protection mode logic
- etc.

**Last updated:** 2026-03-07


