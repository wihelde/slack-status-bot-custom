# ADR-001: Holiday Status Protection with 'not working' Mode

**Status:** Accepted  
**Date:** 2026-03-07  
**Author:** Martin  

## Context

Users can set a Holiday status via the dashboard with an automatic expiration date (e.g., "back on 10.03.2026").

Without protection, the polling system would override this status when:
- Spotify/Apple Music starts playing
- User enters a Zoom/Teams meeting
- The status correction loop runs

This creates poor user experience: user expects Holiday status to be protected while they're away.

## Problem Statement

The original code had two bugs:
1. `isStatusClean()` checked `allowedEmojis` BEFORE `'not working'` mode, allowing Holiday to be overridden
2. `performReset()` didn't check `'not working'` mode at all, clearing Holiday when Spotify stopped

These bugs violated the user's expectation that Holiday status is "untouchable" until the expiration passes.

## Decision

Implement **`'not working'` protection mode** in `statusCheckState`:

```typescript
interface StatusCheckState {
  value: 'not working' | '';  // Protection mode
  activeSource?: string;
  expirationTime?: number;
}
```

When `statusCheckState.value === 'not working'`:
1. `isStatusClean()` returns FALSE for any managed emoji (blocks polling)
2. `performReset()` returns FALSE immediately (blocks reset)
3. `correctStatus()` auto-clears the mode when Slack-side expiration passes

### Protection Checkpoints

Three locations MUST check `'not working'` mode (in order of importance):
1. **`isStatusClean()` at line ~148** - FIRST check, before `allowedEmojis`
2. **`performReset()` at line ~228** - FIRST check, before any status change
3. **`correctStatus()` at line ~381** - Special handling for Holiday expiration

## Consequences

**Positive:**
- Holiday status stays protected until expiration or manual reset (`goOnline()`)
- Respects user's expectation of "away" statuses
- Extensible to other protected statuses (Sick, Off, Parental Leave)
- Auto-detection when Slack expires the status (uses Slack API as source of truth)

**Negative:**
- Three separate protection checks (minor code duplication)
- Performance: negligible (just boolean checks)
- Developers must remember to add this check to new status-setting methods

**Requirements for Future Developers:**
- Any new method that sets status must check `'not working'` mode
- The check MUST come BEFORE any allowance checks
- See ARCHITECTURE.md: "The isStatusClean() Decision Tree" and "The performReset() Protection"

## Alternatives

### A1: Use Local Timer Instead of Slack API Expiration
- Set expiration locally in `statusCheckState.expirationTime`
- Periodically check if expired and auto-clear
- **Rejected:** More complex, requires persistence across restarts, Slack API already does this

### A2: Don't Protect Holiday Status
- Let polling override at will
- **Rejected:** Poor user experience, violates expectations

### A3: Use a Flag Like `isHolidayMode` Instead of `'not working'`
- Specific to Holiday instead of generic
- **Rejected:** Less extensible, `'not working'` is cleaner for other protected statuses

## Implementation Details

- **Bug fixes:** See `statusManager.ts` lines 148, 228, 381
- **Tests:** `statusManager.test.ts` - Holiday protection test cases
- **Documentation:** `ARCHITECTURE.md` - Full explanation of the system

## References

- `ARCHITECTURE.md` - Core Concepts, Critical Flows
- `src/services/statusManager.ts` - Implementation
- `src/services/__tests__/statusManager.test.ts` - Test coverage
