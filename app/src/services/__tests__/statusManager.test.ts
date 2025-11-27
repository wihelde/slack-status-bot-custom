import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StatusManager } from '../statusManager';
import { SlackService } from '../slack';
import { STATUS_MESSAGES } from '../../config/statusConfig';

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

    it('should set statusCheckState to appropriate day value', async () => {
      await statusManager.goOnline();
      
      const state = statusManager.getStatusCheckState();
      expect(state.value).toMatch(/weekday|monday|friday|not working/);
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
      const state = { value: 'weekday' as const, activeSource: 'zoom' };
      statusManager.setStatusCheckState(state);

      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: ':custom_emoji:',
        status_text: 'Custom',
      });

      await statusManager.correctStatus();

      // Should not attempt to set profile
      expect(mockSlackService.setProfile).not.toHaveBeenCalled();
    });

    it('should skip correction if user has set a custom status', async () => {
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: ':palm_tree:',
        status_text: 'Vacationing',
      });

      statusManager.setStatusCheckState({ value: '' });

      await statusManager.correctStatus();

      // Should not attempt to reset
      expect(mockSlackService.setProfile).not.toHaveBeenCalled();
    });

    it('should correct status if it is a managed emoji with wrong state', async () => {
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: STATUS_MESSAGES.SPOTIFY_EMOJI,
        status_text: 'Playing',
      });

      statusManager.setStatusCheckState({ value: '' });

      // We're on Friday, so should set TGIF status
      // Mock the date to be Friday
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-21')); // Friday
      
      await statusManager.correctStatus();
      
      vi.useRealTimers();

      // Should have attempted to reset/correct
      expect(mockSlackService.setProfile).toHaveBeenCalled();
    });
  });

  describe('reset() with blocked status', () => {
    it('should return false if blocked and user has custom status', async () => {
      // User has set a custom (non-managed) status
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: ':palm_tree:',
        status_text: 'Vacationing',
      });

      statusManager.setStatusCheckState({ value: '' });

      // Mock the date to be Saturday (daemon would want to set OFF_EMOJI)
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-22')); // Saturday
      
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
      // State should be updated to monday
      const state = statusManager.getStatusCheckState();
      expect(state.value).toBe('monday');
    });
  });

  describe('StatusCheckState with activeSource', () => {
    it('should track activeSource in statusCheckState', () => {
      const state = { value: 'weekday' as const, activeSource: 'zoom' };
      statusManager.setStatusCheckState(state);

      const retrieved = statusManager.getStatusCheckState();
      expect(retrieved.value).toBe('weekday');
      expect(retrieved.activeSource).toBe('zoom');
    });

    it('should allow clearing activeSource', () => {
      let state: { value: 'weekday' | 'monday' | 'friday' | 'not working' | ''; activeSource?: string } = { value: 'weekday' as const, activeSource: 'zoom' };
      statusManager.setStatusCheckState(state);

      state = { value: 'weekday' as const, activeSource: undefined };
      statusManager.setStatusCheckState(state);

      const retrieved = statusManager.getStatusCheckState();
      expect(retrieved.activeSource).toBeUndefined();
    });
  });

  describe('reset() on weekends', () => {
    it('should skip reset on Saturday and return false', async () => {
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: STATUS_MESSAGES.SPOTIFY_EMOJI,
        status_text: 'Playing',
      });

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-22')); // Saturday

      const result = await statusManager.reset();

      vi.useRealTimers();

      // Should return false because it's weekend
      expect(result).toBe(false);
      // setProfile should NOT be called
      expect(mockSlackService.setProfile).not.toHaveBeenCalled();
    });

    it('should skip reset on Sunday and return false', async () => {
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: STATUS_MESSAGES.SPOTIFY_EMOJI,
        status_text: 'Playing',
      });

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-11-23')); // Sunday

      const result = await statusManager.reset();

      vi.useRealTimers();

      // Should return false because it's weekend
      expect(result).toBe(false);
      // setProfile should NOT be called
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
