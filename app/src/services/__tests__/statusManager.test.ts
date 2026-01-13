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
        expect.any(String)
      );
      expect(mockSlackService.setPresence).toHaveBeenCalledWith('away');
    });

    it('should set statusCheckState to "not working"', async () => {
      await statusManager.goAway();
      
      const state = statusManager.getStatusCheckState();
      expect(state.value).toBe('not working');
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
  });

  describe('reset()', () => {
    it('should check isStatusClean before resetting', async () => {
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: ':custom_emoji:',
        status_text: 'Custom status',
      });

      const result = await statusManager.reset();
      
      // Should be blocked because emoji is not in allowed list
      expect(result).toBe(false);
      expect(mockSlackService.setProfile).not.toHaveBeenCalled();
    });

    it('should set presence to auto', async () => {
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: STATUS_MESSAGES.SPOTIFY_EMOJI,
        status_text: 'Playing Spotify',
      });

      await statusManager.reset();
      
      expect(mockSlackService.setPresence).toHaveBeenCalledWith('auto');
    });

    it('should disable DND', async () => {
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: STATUS_MESSAGES.SPOTIFY_EMOJI,
        status_text: 'Playing Spotify',
      });

      await statusManager.reset();
      
      expect(mockSlackService.disableDND).toHaveBeenCalled();
    });
  });

  describe('isStatusClean()', () => {
    it('should allow resetting if current status is a managed emoji', async () => {
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: STATUS_MESSAGES.SPOTIFY_EMOJI,
        status_text: 'Playing Spotify',
      });

      const result = await statusManager.isStatusClean();
      
      expect(result).toBe(true);
    });

    it('should block resetting if current status is custom and not managed', async () => {
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: ':custom_emoji:',
        status_text: 'Custom status',
      });

      const result = await statusManager.isStatusClean();
      
      expect(result).toBe(false);
    });

    it('should allow resetting if status is empty', async () => {
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: '',
        status_text: '',
      });

      const result = await statusManager.isStatusClean();
      
      expect(result).toBe(true);
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

  describe('reset() with protected statuses', () => {
    it('should set statusCheckState to "not working" when OFF_EMOJI is set', async () => {
      // Create custom status with OFF_EMOJI for Monday
      const customStatuses = [
        {
          id: 'off-monday',
          emoji: STATUS_MESSAGES.OFF_EMOJI,
          message: 'Off',
          days: [DayOfWeek.MONDAY],
          enableDND: false,
          presence: 'away' as const,
          quickActionLabel: null,
          category: 'day_based' as const,
        },
      ];
      
      mockSlackService.setProfile.mockClear();
      mockSlackService.setProfile.mockResolvedValue(true);
      
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-17')); // Monday
      
      const customStatusManager = new StatusManager(mockSlackService, customStatuses);
      
      // Use resetWithoutCheck() to bypass isStatusClean() for this test
      await customStatusManager.resetWithoutCheck();

      vi.useRealTimers();
      
      const state = customStatusManager.getStatusCheckState();
      expect(state.value).toBe('not working');
    });

    it('should set statusCheckState to "not working" when SICK_EMOJI is configured', async () => {
      const customStatuses = [
        {
          id: 'sick-monday',
          emoji: STATUS_MESSAGES.SICK_EMOJI,
          message: 'Sick',
          days: [DayOfWeek.MONDAY],
          enableDND: false,
          presence: 'away' as const,
          quickActionLabel: null,
          category: 'day_based' as const,
        },
      ];
      
      mockSlackService.setProfile.mockClear();
      mockSlackService.setProfile.mockResolvedValue(true);
      
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-17')); // Monday
      
      const customStatusManager = new StatusManager(mockSlackService, customStatuses);

      // Use resetWithoutCheck() to bypass isStatusClean() for this test
      await customStatusManager.resetWithoutCheck();

      vi.useRealTimers();
      
      const state = customStatusManager.getStatusCheckState();
      expect(state.value).toBe('not working');
    });

    it('should set statusCheckState to empty string for normal statuses', async () => {
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
      vi.setSystemTime(new Date('2025-11-17')); // Monday
      vi.useRealTimers();

      await customStatusManager.reset();

      const state = customStatusManager.getStatusCheckState();
      expect(state.value).toBe('');
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

      expect(mockSlackService.setProfile).toHaveBeenCalledWith(':smile:', 'Weekend vibes');
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

      expect(mockSlackService.setProfile).toHaveBeenCalledWith('', '');
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

  describe('setHoliday()', () => {
    it('should set holiday status with correct back date and expiration', async () => {
      const result = await statusManager.setHoliday('21.11.2025'); // Friday
      
      expect(result).toBe(true);
      // Should call setProfile with vacation message and back date
      expect(mockSlackService.setProfile).toHaveBeenCalled();
      const call = mockSlackService.setProfile.mock.calls[0];
      expect(call[0]).toBe(STATUS_MESSAGES.HOLIDAY_EMOJI);
      expect(call[1]).toContain('strong vacationing');
      expect(call[1]).toContain('24.11.2025'); // Monday (Fri + 3 days)
      // Should have expiration timestamp
      expect(typeof call[2]).toBe('number');
      expect(call[2]).toBeGreaterThan(0);
    });

    it('should set holiday with +1 day for non-Friday return date', async () => {
      const result = await statusManager.setHoliday('24.11.2025'); // Monday
      
      expect(result).toBe(true);
      const call = mockSlackService.setProfile.mock.calls[0];
      expect(call[1]).toContain('25.11.2025'); // Next day
    });

    it('should reject invalid date format', async () => {
      const result = await statusManager.setHoliday('invalid-date');
      
      expect(result).toBe(false);
      expect(mockSlackService.setProfile).not.toHaveBeenCalled();
    });

    it('should set away presence for holiday', async () => {
      await statusManager.setHoliday('21.11.2025');
      
      expect(mockSlackService.setPresence).toHaveBeenCalledWith('away');
    });
  });

  describe('OFF_EMOJI not in managed list', () => {
    it('should block resetting if user manually set OFF_EMOJI', async () => {
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: STATUS_MESSAGES.OFF_EMOJI,
        status_text: 'Custom away message',
      });

      statusManager.setStatusCheckState({ value: '' });

      const result = await statusManager.isStatusClean();

      // Should be false because OFF_EMOJI is not in managed list
      expect(result).toBe(false);
    });
  });
});
