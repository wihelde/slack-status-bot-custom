import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StatusManager } from '../statusManager';
import { SlackService } from '../slack';
import { STATUS_MESSAGES, DayOfWeek } from '../../config/statusConfig';

// Mock SlackService
vi.mock('../slack');

describe('StatusManager', () => {
  let statusManager: StatusManager;
  let mockSlackService: any;

  beforeEach(() => {
    mockSlackService = new SlackService('test-token') as any;
    
    // Mock all SlackService methods
    mockSlackService.getProfile = vi.fn().mockResolvedValue({
      status_emoji: STATUS_MESSAGES.SPOTIFY_EMOJI,
      status_text: 'Playing Spotify',
    });
    mockSlackService.setProfile = vi.fn().mockResolvedValue(true);
    mockSlackService.setPresence = vi.fn().mockResolvedValue(true);
    mockSlackService.enableDND = vi.fn().mockResolvedValue(true);
    mockSlackService.disableDND = vi.fn().mockResolvedValue(true);

    statusManager = new StatusManager(mockSlackService);
  });

  describe('goOnline()', () => {
    it('should set status without checking isStatusClean', async () => {
      const result = await statusManager.goOnline();
      
      expect(result).toBe(true);
      expect(mockSlackService.setProfile).toHaveBeenCalled();
      expect(mockSlackService.setPresence).toHaveBeenCalledWith('auto');
      expect(mockSlackService.disableDND).toHaveBeenCalled();
    });

    it('should set statusCheckState to empty string when day has no protected status', async () => {
      await statusManager.goOnline();
      
      const state = statusManager.getStatusCheckState();
      expect(state.value).toBe('');
    });
  });

  describe('goAway()', () => {
    it('should set away status', async () => {
      const result = await statusManager.goAway();
      
      expect(result).toBe(true);
      expect(mockSlackService.setProfile).toHaveBeenCalledWith(
        STATUS_MESSAGES.OFF_EMOJI,
        expect.any(String),
        0
      );
      expect(mockSlackService.setPresence).toHaveBeenCalledWith('away');
    });

    it('should set statusCheckState to "not working"', async () => {
      await statusManager.goAway();
      
      const state = statusManager.getStatusCheckState();
      expect(state.value).toBe('not working');
    });

    it('should not mark goAway as manual activeSource', async () => {
      await statusManager.goAway();

      const state = statusManager.getStatusCheckState();
      expect(state.activeSource).toBeUndefined();
    });
  });

  describe('setCustomStatus()', () => {
    it('should set custom status for active emoji (Meeting)', async () => {
      const result = await statusManager.setCustomStatus(
        STATUS_MESSAGES.MEETING_EMOJI,
        'In a meeting'
      );
      
      expect(result).toBe(true);
      expect(mockSlackService.setProfile).toHaveBeenCalledWith(
        STATUS_MESSAGES.MEETING_EMOJI,
        'In a meeting',
        0
      );
      expect(mockSlackService.setPresence).toHaveBeenCalledWith('auto');
      expect(mockSlackService.enableDND).toHaveBeenCalled();
    });

    it('should set custom status for away emoji (Sick)', async () => {
      const result = await statusManager.setCustomStatus(
        STATUS_MESSAGES.SICK_EMOJI,
        'Out sick'
      );
      
      expect(result).toBe(true);
      expect(mockSlackService.setProfile).toHaveBeenCalledWith(
        STATUS_MESSAGES.SICK_EMOJI,
        'Out sick',
        0
      );
      expect(mockSlackService.setPresence).toHaveBeenCalledWith('away');
      expect(mockSlackService.disableDND).toHaveBeenCalled();
    });

    it('should disable DND for non-meeting status', async () => {
      await statusManager.setCustomStatus(
        STATUS_MESSAGES.BREAK_EMOJI,
        'On a break'
      );
      
      expect(mockSlackService.disableDND).toHaveBeenCalled();
    });

    it('should set statusCheckState to "not working" for sick status', async () => {
      await statusManager.setCustomStatus(
        STATUS_MESSAGES.SICK_EMOJI,
        'Out sick'
      );
      
      const state = statusManager.getStatusCheckState();
      expect(state.value).toBe('not working');
    });

    it('should mark manual custom statuses as activeSource manual', async () => {
      await statusManager.setCustomStatus(
        STATUS_MESSAGES.BREAK_EMOJI,
        'On a break'
      );

      const state = statusManager.getStatusCheckState();
      expect(state.activeSource).toBe('manual');
    });
  });

  describe('setExternalStatus()', () => {
    it('should set free-form status without marking a manual activeSource', async () => {
      const result = await statusManager.setExternalStatus(
        ':shopping_trolley:',
        'Bin einkaufen'
      );

      expect(result).toBe(true);
      expect(mockSlackService.setProfile).toHaveBeenCalledWith(
        ':shopping_trolley:',
        'Bin einkaufen',
        0
      );
      expect(mockSlackService.setPresence).toHaveBeenCalledWith('auto');

      const state = statusManager.getStatusCheckState();
      expect(state.value).toBe('');
      expect(state.activeSource).toBeUndefined();
    });

    it('should set away presence when requested', async () => {
      const result = await statusManager.setExternalStatus(
        ':shopping_trolley:',
        'Bin einkaufen',
        'away'
      );

      expect(result).toBe(true);
      expect(mockSlackService.setPresence).toHaveBeenCalledWith('away');
    });

    it('should protect external statuses from correction even when the emoji is managed', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-10')); // Friday

      await statusManager.setExternalStatus(
        STATUS_MESSAGES.FOCUS_EMOJI,
        STATUS_MESSAGES.FOCUS_MESSAGE,
        'auto'
      );
      mockSlackService.setProfile.mockClear();

      statusManager.setProfileCache({
        status_emoji: STATUS_MESSAGES.FOCUS_EMOJI,
        status_text: STATUS_MESSAGES.FOCUS_MESSAGE,
      });

      await statusManager.correctStatus();

      vi.useRealTimers();

      expect(mockSlackService.setProfile).not.toHaveBeenCalledWith(
        STATUS_MESSAGES.TGIF_EMOJI,
        STATUS_MESSAGES.TGIF_MESSAGE,
        expect.anything()
      );
    });

    it('should not allow observed sources to override external statuses with managed emojis', async () => {
      await statusManager.setExternalStatus(
        STATUS_MESSAGES.FOCUS_EMOJI,
        STATUS_MESSAGES.FOCUS_MESSAGE,
        'auto'
      );

      statusManager.setProfileCache({
        status_emoji: STATUS_MESSAGES.FOCUS_EMOJI,
        status_text: STATUS_MESSAGES.FOCUS_MESSAGE,
      });

      await expect(statusManager.isStatusClean()).resolves.toBe(false);
    });
  });

  describe('setHoliday()', () => {
    it('should mark holiday as manual activeSource and protected state', async () => {
      const result = await statusManager.setHoliday('14.04.2026');

      expect(result).toBe(true);
      const state = statusManager.getStatusCheckState();
      expect(state.value).toBe('not working');
      expect(state.activeSource).toBe('manual');
      expect(mockSlackService.setProfile).toHaveBeenCalledWith(
        STATUS_MESSAGES.HOLIDAY_EMOJI,
        expect.stringContaining('back on'),
        expect.any(Number)
      );
    });
  });

  describe('reset()', () => {
    it('should check isStatusClean before resetting', async () => {
      // Mock to Monday so there's a configured status for the day
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-24')); // Monday
      
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: ':custom_emoji:',
        status_text: 'Custom status',
      });

      const result = await statusManager.reset();
      
      vi.useRealTimers();
      
      // Should be blocked because emoji is not in allowed list
      expect(result).toBe(false);
      expect(mockSlackService.setProfile).not.toHaveBeenCalled();
    });

    it('should set presence to auto', async () => {
      // Mock to Monday so there's a configured status for the day
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-24')); // Monday
      
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: STATUS_MESSAGES.SPOTIFY_EMOJI,
        status_text: 'Playing Spotify',
      });

      await statusManager.reset();
      
      vi.useRealTimers();
      
      expect(mockSlackService.setPresence).toHaveBeenCalledWith('auto');
    });

    it('should disable DND', async () => {
      // Mock to Monday so there's a configured status for the day
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-24')); // Monday
      
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: STATUS_MESSAGES.SPOTIFY_EMOJI,
        status_text: 'Playing Spotify',
      });

      await statusManager.reset();
      
      vi.useRealTimers();
      
      expect(mockSlackService.disableDND).toHaveBeenCalled();
    });
  });

  describe('correctStatus()', () => {
    it('should skip correction if a source is actively running', async () => {
      const state = { value: '' as const, activeSource: 'zoom' };
      statusManager.setStatusCheckState(state);

      // Set the profile cache instead of mocking getProfile
      statusManager.setProfileCache({
        status_emoji: ':custom_emoji:',
        status_text: 'Custom',
      });

      await statusManager.correctStatus();

      // Should not attempt to set profile (source still active)
      expect(mockSlackService.setProfile).not.toHaveBeenCalled();
    });

    it('should skip correction if user has set a custom status', async () => {
      // Use a custom emoji that is NOT in the managed statuses
      statusManager.setProfileCache({
        status_emoji: ':custom_user_emoji:',
        status_text: 'Custom vacation message',
      });

      statusManager.setStatusCheckState({ value: '' });

      await statusManager.correctStatus();

      // Should not attempt to reset because the emoji is not managed
      expect(mockSlackService.setProfile).not.toHaveBeenCalled();
    });

    it('should correct status if emoji is not valid for today', async () => {
      // Set a Spotify emoji but we're on Friday (where Friday status should be set)
      statusManager.setProfileCache({
        status_emoji: STATUS_MESSAGES.SPOTIFY_EMOJI,
        status_text: 'Playing',
      });

      statusManager.setStatusCheckState({ value: '' });

      // Mock the date to be Friday
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-21')); // Friday
      
      await statusManager.correctStatus();
      
      vi.useRealTimers();

      // Should have attempted to reset because Spotify is not a valid Friday emoji
      expect(mockSlackService.setProfile).toHaveBeenCalled();
    });

    it('should skip correction if emoji is valid for today', async () => {
      // Set Friday emoji on Friday - should NOT reset
      statusManager.setProfileCache({
        status_emoji: STATUS_MESSAGES.TGIF_EMOJI,
        status_text: 'TGIF',
      });

      statusManager.setStatusCheckState({ value: '' });

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-21')); // Friday
      
      mockSlackService.setProfile.mockClear();
      await statusManager.correctStatus();
      
      vi.useRealTimers();

      // Should NOT have reset because emoji is valid for Friday
      expect(mockSlackService.setProfile).not.toHaveBeenCalled();
    });

    it('should replace overridable third-party status (Officely)', async () => {
      // Set Officely Hamburg status - should be replaced
      statusManager.setProfileCache({
        status_emoji: ':office:',
        status_text: 'Office Hamburg (via Officely)',
      });

      statusManager.setStatusCheckState({ value: '' });

      mockSlackService.setProfile.mockClear();
      await statusManager.correctStatus();

      // Should have attempted to set a new status (replace Officely with day-based)
      expect(mockSlackService.setProfile).toHaveBeenCalled();
      // The new emoji should NOT be :office:
      const callArgs = mockSlackService.setProfile.mock.calls[0];
      expect(callArgs[0]).not.toBe(':office:');
    });

    it('should replace custom overridable status', async () => {
      // Add custom overridable pattern
      statusManager.setOverridablePatterns([
        {
          emoji: ':custom_tool:',
          messagePatterns: ['Status from Custom Tool'],
          description: 'Custom tool status',
        },
      ]);

      // Set custom tool status - should be replaced
      statusManager.setProfileCache({
        status_emoji: ':custom_tool:',
        status_text: 'Status from Custom Tool',
      });

      statusManager.setStatusCheckState({ value: '' });

      mockSlackService.setProfile.mockClear();
      await statusManager.correctStatus();

      // Should have attempted to replace the custom tool status
      expect(mockSlackService.setProfile).toHaveBeenCalled();
      const callArgs = mockSlackService.setProfile.mock.calls[0];
      expect(callArgs[0]).not.toBe(':custom_tool:');
    });

    it('should NOT replace overridable status with wrong message', async () => {
      // Officely Belgrade is in the patterns, but Paris is not
      statusManager.setProfileCache({
        status_emoji: ':office:',
        status_text: 'Office Paris (via Officely)',
      });

      statusManager.setStatusCheckState({ value: '' });

      mockSlackService.setProfile.mockClear();
      await statusManager.correctStatus();

      // Should NOT have reset because the message doesn't match the pattern
      expect(mockSlackService.setProfile).not.toHaveBeenCalled();
    });
  });

  describe('correctStatus() with empty status correction', () => {
    it('should not correct empty status when no default is configured for today', async () => {
      const customStatuses = [
        {
          id: 'monday',
          emoji: STATUS_MESSAGES.MONDAY_EMOJI,
          message: 'Monday',
          days: [DayOfWeek.MONDAY],
          enableDND: false,
          presence: 'auto' as const,
          quickActionLabel: null,
          category: 'day_based' as const,
        },
      ];

      const customStatusManager = new StatusManager(mockSlackService, customStatuses);

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-23')); // Sunday (no config)

      customStatusManager.setProfileCache({ status_emoji: '', status_text: '' });
      customStatusManager.setStatusCheckState({ value: '' });

      await customStatusManager.correctStatus();

      vi.useRealTimers();

      expect(mockSlackService.setProfile).not.toHaveBeenCalled();
    });

    it('should start grace period on first empty status detection', async () => {
      const customStatuses = [
        {
          id: 'monday',
          emoji: STATUS_MESSAGES.MONDAY_EMOJI,
          message: 'Monday',
          days: [DayOfWeek.MONDAY],
          enableDND: false,
          presence: 'auto' as const,
          quickActionLabel: null,
          category: 'day_based' as const,
        },
      ];

      const customStatusManager = new StatusManager(mockSlackService, customStatuses);

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-17')); // Monday

      customStatusManager.setProfileCache({ status_emoji: '', status_text: '' });
      customStatusManager.setStatusCheckState({ value: '' });

      await customStatusManager.correctStatus();

      vi.useRealTimers();

      // Should not correct yet (grace period just started)
      expect(mockSlackService.setProfile).not.toHaveBeenCalled();
      // State should have lastEmptySeen set
      expect(customStatusManager.getStatusCheckState().lastEmptySeen).toBeDefined();
    });

    it('should not correct empty status within grace period', async () => {
      const customStatuses = [
        {
          id: 'monday',
          emoji: STATUS_MESSAGES.MONDAY_EMOJI,
          message: 'Monday',
          days: [DayOfWeek.MONDAY],
          enableDND: false,
          presence: 'auto' as const,
          quickActionLabel: null,
          category: 'day_based' as const,
        },
      ];

      const customStatusManager = new StatusManager(mockSlackService, customStatuses);

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-17T10:00:00')); // Monday

      const now = Math.floor(Date.now() / 1000);
      customStatusManager.setProfileCache({ status_emoji: '', status_text: '' });
      customStatusManager.setStatusCheckState({ value: '', lastEmptySeen: now - 5 * 60 }); // 5 min ago

      await customStatusManager.correctStatus();

      vi.useRealTimers();

      // Should not correct (only 5 minutes elapsed, grace period is 10 min)
      expect(mockSlackService.setProfile).not.toHaveBeenCalled();
    });

    it('should correct empty status after grace period expires', async () => {
      const customStatuses = [
        {
          id: 'monday',
          emoji: STATUS_MESSAGES.MONDAY_EMOJI,
          message: 'Monday',
          days: [DayOfWeek.MONDAY],
          enableDND: false,
          presence: 'auto' as const,
          quickActionLabel: null,
          category: 'day_based' as const,
        },
      ];

      const customStatusManager = new StatusManager(mockSlackService, customStatuses);

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-17T10:00:00')); // Monday

      const now = Math.floor(Date.now() / 1000);
      customStatusManager.setProfileCache({ status_emoji: '', status_text: '' });
      customStatusManager.setStatusCheckState({ value: '', lastEmptySeen: now - 11 * 60 }); // 11 min ago

      mockSlackService.setProfile.mockClear();
      await customStatusManager.correctStatus();

      vi.useRealTimers();

      // Should correct (grace period of 10 min has passed)
      expect(mockSlackService.setProfile).toHaveBeenCalled();
      // lastEmptySeen should be cleared
      expect(customStatusManager.getStatusCheckState().lastEmptySeen).toBeUndefined();
    });

    it('should reset lastEmptySeen when status becomes non-empty', async () => {
      statusManager.setStatusCheckState({ value: '', lastEmptySeen: 1000 });
      statusManager.setProfileCache({
        status_emoji: STATUS_MESSAGES.MONDAY_EMOJI,
        status_text: 'Monday',
      });

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-17')); // Monday

      await statusManager.correctStatus();

      vi.useRealTimers();

      expect(statusManager.getStatusCheckState().lastEmptySeen).toBeUndefined();
    });
  });

  describe('reset() with blocked status', () => {
    it('should return false if blocked and user has custom status', async () => {
      // User has set a custom (truly non-managed) status - something we don't manage
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: ':custom_emoji_we_dont_use:',
        status_text: 'Custom status',
      });

      statusManager.setStatusCheckState({ value: '' });

      // Mock the date to be Monday (would try to set Monday emoji)
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-24')); // Monday
      
      const result = await statusManager.reset();
      
      vi.useRealTimers();

      // Should return false because custom status blocks the change
      expect(result).toBe(false);
      // State should not change
      const state = statusManager.getStatusCheckState();
      expect(state.value).toBe('');
      // setProfile should not be called (blocked by isStatusClean)
      expect(mockSlackService.setProfile).not.toHaveBeenCalled();
    });

    it('should succeed if status is a managed emoji and matches weekday', async () => {
      // Current status is a managed emoji (allowed to change)
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: STATUS_MESSAGES.SPOTIFY_EMOJI,
        status_text: 'Playing Spotify',
      });

      statusManager.setStatusCheckState({ value: '' });

      // Mock the date to be Monday
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-24')); // Monday
      
      const result = await statusManager.reset();
      
      vi.useRealTimers();

      // Should succeed because managed emoji is allowed to change
      expect(result).toBe(true);
      // setProfile should have been called
      expect(mockSlackService.setProfile).toHaveBeenCalled();
      // State should be updated to empty string (normal status, not protected)
      const state = statusManager.getStatusCheckState();
      expect(state.value).toBe('');
    });
  });

  describe('StatusCheckState with activeSource', () => {
    it('should track activeSource in statusCheckState', () => {
      const state = { value: '' as const, activeSource: 'zoom' };
      statusManager.setStatusCheckState(state);

      const retrieved = statusManager.getStatusCheckState();
      expect(retrieved.value).toBe('');
      expect(retrieved.activeSource).toBe('zoom');
    });

    it('should allow clearing activeSource', () => {
      let state: { value: '' | 'not working'; activeSource?: string } = { value: '', activeSource: 'zoom' };
      statusManager.setStatusCheckState(state);

      state = { value: '', activeSource: undefined };
      statusManager.setStatusCheckState(state);

      const retrieved = statusManager.getStatusCheckState();
      expect(retrieved.activeSource).toBeUndefined();
    });
  });

  describe('Holiday Status Protection Against Polling', () => {
    it('should restore not working mode from a valid Slack Holiday status after restart', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));

      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: STATUS_MESSAGES.HOLIDAY_EMOJI,
        status_text: 'strong vacationing (back on 16.03.2026)',
        status_expiration: Math.floor(new Date('2026-03-15T23:59:59Z').getTime() / 1000),
      });

      const restored = await statusManager.restoreProtectedStatusFromSlack();

      expect(restored).toBe(true);
      expect(statusManager.getStatusCheckState().value).toBe('not working');
      expect(mockSlackService.setProfile).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should not restore not working mode from an expired Slack Holiday status after restart', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-16T10:00:00Z'));

      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: STATUS_MESSAGES.HOLIDAY_EMOJI,
        status_text: 'strong vacationing (back on 16.03.2026)',
        status_expiration: Math.floor(new Date('2026-03-15T23:59:59Z').getTime() / 1000),
      });

      const restored = await statusManager.restoreProtectedStatusFromSlack();

      expect(restored).toBe(false);
      expect(statusManager.getStatusCheckState().value).toBe('');

      vi.useRealTimers();
    });

    it('should not allow Spotify to override Holiday status when in "not working" mode', async () => {
      // Setup: User has set Holiday status
      await statusManager.setCustomStatus(
        STATUS_MESSAGES.HOLIDAY_EMOJI,
        'strong vacationing (back on 14.03.2026)'
      );

      // Verify the state is set to 'not working'
      let state = statusManager.getStatusCheckState();
      expect(state.value).toBe('not working');

      // Now simulate Spotify polling trying to change status
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: STATUS_MESSAGES.HOLIDAY_EMOJI,
        status_text: 'strong vacationing (back on 14.03.2026)',
      });

      const isClean = await statusManager.isStatusClean();

      // Should be false - Holiday status is protected
      expect(isClean).toBe(false);
      
      // Spotify should NOT be allowed to set status
      mockSlackService.setProfile.mockClear();
      // This simulates what daemon.ts does during polling
      if (isClean) {
        await statusManager.setCustomStatus(
          STATUS_MESSAGES.SPOTIFY_EMOJI,
          'Playing something'
        );
      }

      // setProfile should not have been called
      expect(mockSlackService.setProfile).not.toHaveBeenCalled();
      
      // State should still be 'not working'
      state = statusManager.getStatusCheckState();
      expect(state.value).toBe('not working');
    });

    it('should allow Spotify when Holiday status was cleared (statusCheckState reset)', async () => {
      // Setup: User has set Holiday status
      await statusManager.setCustomStatus(
        STATUS_MESSAGES.HOLIDAY_EMOJI,
        'strong vacationing'
      );

      let state = statusManager.getStatusCheckState();
      expect(state.value).toBe('not working');

      // User manually goes online (clears the holiday status)
      await statusManager.goOnline();

      state = statusManager.getStatusCheckState();
      expect(state.value).toBe('');

      // Now Spotify should be able to set status
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: STATUS_MESSAGES.MONDAY_EMOJI,
        status_text: 'Monday',
      });

      const isClean = await statusManager.isStatusClean();

      // Should be true - no longer in 'not working' mode
      expect(isClean).toBe(true);
    });

    it('should clear activeSource manual when user goes online after a manual status', async () => {
      await statusManager.setCustomStatus(
        STATUS_MESSAGES.HOLIDAY_EMOJI,
        'strong vacationing'
      );

      let state = statusManager.getStatusCheckState();
      expect(state.activeSource).toBe('manual');

      await statusManager.goOnline();

      state = statusManager.getStatusCheckState();
      expect(state.value).toBe('');
      expect(state.activeSource).toBeUndefined();
    });
  });

  describe('reset() on weekends with user configuration', () => {
    it('should set weekend status when user has configured one for Saturday', async () => {
      mockSlackService.setProfile.mockClear();
      mockSlackService.setProfile = vi.fn().mockResolvedValue(true);
      
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-22')); // Saturday
      
      const customStatuses = [
        {
          id: 'saturday-status',
          emoji: ':smile:',
          message: 'Weekend vibes',
          days: [DayOfWeek.SATURDAY],
          enableDND: false,
          presence: 'auto' as const,
          quickActionLabel: null,
          category: 'day_based' as const,
        },
      ];
      
      const customStatusManager = new StatusManager(mockSlackService, customStatuses);

      await customStatusManager.reset();
      
      vi.useRealTimers();

      expect(mockSlackService.setProfile).toHaveBeenCalledWith(':smile:', 'Weekend vibes', 0);
    });

    it('should set empty status on weekend when user has no configuration', async () => {
      // Create a custom status manager with NO Saturday configuration
      const customStatuses = [
        {
          id: 'monday',
          emoji: STATUS_MESSAGES.MONDAY_EMOJI,
          message: 'Monday vibes',
          days: [DayOfWeek.MONDAY],
          enableDND: false,
          presence: 'auto' as const,
          quickActionLabel: null,
          category: 'day_based' as const,
        },
      ];
      
      const customStatusManager = new StatusManager(mockSlackService, customStatuses);

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-22')); // Saturday
      
      await customStatusManager.reset();
      
      vi.useRealTimers();

      expect(mockSlackService.setProfile).toHaveBeenCalledWith('', '', 0);
    });

    it('should reset Spotify status on weekend when music stops', async () => {
      const customStatuses = [
        {
          id: 'weekend-off',
          emoji: ':smile:',
          message: 'Weekend',
          days: [DayOfWeek.SATURDAY],
          enableDND: false,
          presence: 'auto' as const,
          quickActionLabel: null,
          category: 'day_based' as const,
        },
      ];
      
      const customStatusManager = new StatusManager(mockSlackService, customStatuses);
      
      mockSlackService.setProfile.mockClear();
      
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-22')); // Saturday
      
      customStatusManager.setStatusCheckState({ value: '' });
      // Set profile cache (Spotify emoji, but Saturday config has Saturday emoji)
      customStatusManager.setProfileCache({
        status_emoji: STATUS_MESSAGES.SPOTIFY_EMOJI,
        status_text: 'Playing',
      });
      
      await customStatusManager.correctStatus();
      
      vi.useRealTimers();

      expect(mockSlackService.setProfile).toHaveBeenCalled();
    });
  });

  describe('correctStatus() with protected status active', () => {
    it('should skip correction when statusCheckState.value is "not working"', async () => {
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: STATUS_MESSAGES.SPOTIFY_EMOJI,
        status_text: 'Playing',
      });

      statusManager.setStatusCheckState({ value: 'not working' });

      await statusManager.correctStatus();

      expect(mockSlackService.setProfile).not.toHaveBeenCalled();
    });

    it('should not be overridden by Spotify when OFF_EMOJI with "not working" status is set', async () => {
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: STATUS_MESSAGES.OFF_EMOJI,
        status_text: 'Off',
      });

      statusManager.setStatusCheckState({ value: 'not working' });

      await statusManager.correctStatus();

      expect(mockSlackService.setProfile).not.toHaveBeenCalled();
    });
  });

  describe('correctStatus() with day-based status update', () => {
    it('should update to configured day status if different from current', async () => {
      mockSlackService.setProfile.mockClear();
      mockSlackService.setProfile = vi.fn().mockResolvedValue(true);
      
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-17')); // Monday
      
      const customStatuses = [
        {
          id: 'monday',
          emoji: STATUS_MESSAGES.MONDAY_EMOJI,
          message: 'Monday',
          days: [DayOfWeek.MONDAY],
          enableDND: false,
          presence: 'auto' as const,
          quickActionLabel: null,
          category: 'day_based' as const,
        },
      ];
      
      const customStatusManager = new StatusManager(mockSlackService, customStatuses);

      customStatusManager.setStatusCheckState({ value: '' });
      // Set profile cache to Spotify (different from Monday emoji)
      customStatusManager.setProfileCache({
        status_emoji: STATUS_MESSAGES.SPOTIFY_EMOJI,
        status_text: 'Playing',
      });
      
      await customStatusManager.correctStatus();
      
      vi.useRealTimers();

      expect(mockSlackService.setProfile).toHaveBeenCalled();
    });

    it('should not update if current emoji matches day configuration', async () => {
      const customStatuses = [
        {
          id: 'monday',
          emoji: STATUS_MESSAGES.MONDAY_EMOJI,
          message: 'Monday',
          days: [DayOfWeek.MONDAY],
          enableDND: false,
          presence: 'auto' as const,
          quickActionLabel: null,
          category: 'day_based' as const,
        },
      ];
      
      const customStatusManager = new StatusManager(mockSlackService, customStatuses);

      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: STATUS_MESSAGES.MONDAY_EMOJI,
        status_text: 'Monday',
      });

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-17')); // Monday
      
      customStatusManager.setStatusCheckState({ value: '' });
      await customStatusManager.correctStatus();
      
      vi.useRealTimers();

      expect(mockSlackService.setProfile).not.toHaveBeenCalled();
    });
  });

  describe('correctStatus() with Holiday expiration', () => {
    it('should skip correction when Holiday status has active expiration', async () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 86400; // +1 day
      
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: STATUS_MESSAGES.HOLIDAY_EMOJI,
        status_text: 'strong vacationing',
        status_expiration: futureTimestamp,
      });

      statusManager.setStatusCheckState({ value: 'not working' });
      mockSlackService.setProfile.mockClear();
      
      await statusManager.correctStatus();

      // Should not attempt to change status (Holiday is protected by expiration)
      expect(mockSlackService.setProfile).not.toHaveBeenCalled();
    });

    it('should clear not working mode when Holiday expiration has ended', async () => {
      // This test directly verifies that the expired holiday logic works
      // by calling correctStatus with a profile that has expired holiday status
      
      const pastTimestamp = Math.floor(Date.now() / 1000) - 86400; // 1 day ago
      const now = Math.floor(Date.now() / 1000);
      
      // Verify the timestamp is actually in the past
      expect(pastTimestamp).toBeLessThan(now);
      
      // Create a fresh StatusManager instance
      const testStatusManager = new StatusManager(mockSlackService);
      
      // Set initial state
      testStatusManager.setStatusCheckState({ value: 'not working' });
      
      // Set profile cache with expired holiday
      testStatusManager.setProfileCache({
        status_emoji: STATUS_MESSAGES.HOLIDAY_EMOJI,
        status_text: 'strong vacationing',
        status_expiration: pastTimestamp,
      });

      // Verify initial state
      let state = testStatusManager.getStatusCheckState();
      expect(state.value).toBe('not working');

      // Call correctStatus - it should clear the not working mode
      // because the Holiday expiration is in the past
      await testStatusManager.correctStatus();

      // Verify that the state was cleared
      state = testStatusManager.getStatusCheckState();
      expect(state.value).toBe('');
      expect(state.activeSource).toBeUndefined();
    });

    it('should protect other not working statuses regardless of expiration', async () => {
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: STATUS_MESSAGES.OFF_EMOJI,
        status_text: 'Off',
        status_expiration: 0, // No expiration
      });

      statusManager.setStatusCheckState({ value: 'not working' });
      mockSlackService.setProfile.mockClear();
      
      await statusManager.correctStatus();

      // Should not attempt to change status (Off is always protected)
      expect(mockSlackService.setProfile).not.toHaveBeenCalled();
    });

  });
});
