import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StatusManager } from '../statusManager';
import { SlackService } from '../slack';
import { STATUS_MESSAGES } from '../../config/statusConfig';

// Mock SlackService
vi.mock('../slack');

describe('StatusManager', () => {
  let statusManager: StatusManager;
  let mockSlackService: vi.Mocked<SlackService>;

  beforeEach(() => {
    mockSlackService = new SlackService('test-token') as vi.Mocked<SlackService>;
    
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
      expect(state.value).toMatch(/weekday|monday|friday|weekend/);
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

    it('should set statusCheckState to "not working"', async () => {
      await statusManager.setCustomStatus(
        STATUS_MESSAGES.FOCUS_EMOJI,
        'Focusing'
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
});
