import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SlackService } from '../slack';
import { expectConsoleMessages } from '../../__tests__/helpers/expectedConsole';
import axios from 'axios';

vi.mock('axios');
const mockedAxios = axios as any;

describe('SlackService', () => {
  let slackService: SlackService;
  const mockToken = 'xoxb-test-token';
  const mockTokens = ['xoxb-token1', 'xoxb-token2'];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with single token', () => {
      slackService = new SlackService(mockToken);
      expect(slackService).toBeDefined();
    });

    it('should initialize with multiple tokens', () => {
      slackService = new SlackService(mockTokens);
      expect(slackService).toBeDefined();
    });
  });

  describe('getProfile', () => {
    beforeEach(() => {
      slackService = new SlackService(mockToken);
    });

    it('should return profile when API call succeeds', async () => {
      const mockProfile = {
        status_emoji: ':shark:',
        status_text: 'Working',
      };

      mockedAxios.create.mockReturnValue({
        get: vi.fn().mockResolvedValue({
          data: { ok: true, profile: mockProfile },
        }),
      } as any);

      slackService = new SlackService(mockToken);
      const profile = await slackService.getProfile();

      expect(profile).toEqual(mockProfile);
    });

    it('should return null when API call fails', async () => {
      expectConsoleMessages('error', [/\[slack\] getProfile failed/],
        'Slack-Profilabfrage schlägt auch nach Wiederholung absichtlich fehl.');
      const getMock = vi.fn().mockRejectedValue(new Error('Network error'));
      mockedAxios.create.mockReturnValue({ get: getMock } as any);

      slackService = new SlackService(mockToken);
      const profile = await slackService.getProfile();

      expect(profile).toBeNull();
      expect(getMock).toHaveBeenCalledTimes(2);
    });

    it('should retry a failed profile request once', async () => {
      const mockProfile = {
        status_emoji: ':face_with_thermometer:',
        status_text: 'Out sick',
      };
      const getMock = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: { ok: true, profile: mockProfile } });
      mockedAxios.create.mockReturnValue({ get: getMock } as any);

      slackService = new SlackService(mockToken);

      await expect(slackService.getProfile()).resolves.toEqual(mockProfile);
      expect(getMock).toHaveBeenCalledTimes(2);
    });

    it('should throw error when no tokens configured', async () => {
      slackService = new SlackService([]);

      await expect(slackService.getProfile()).rejects.toThrow(
        'No Slack tokens configured'
      );
    });
  });

  describe('setProfile', () => {
    beforeEach(() => {
      slackService = new SlackService(mockToken);
    });

    it('should set profile successfully', async () => {
      vi.useFakeTimers();
      mockedAxios.create.mockReturnValue({
        post: vi.fn().mockResolvedValue({
          data: { ok: true },
        }),
        get: vi.fn().mockResolvedValue({
          data: { ok: true, profile: { status_emoji: ':shark:', status_text: 'Working' } },
        }),
      } as any);

      slackService = new SlackService(mockToken);
      const result = slackService.setProfile(':shark:', 'Working');
      await vi.runAllTimersAsync();

      await expect(result).resolves.toBe(true);
    });

    it('should handle API error', async () => {
      expectConsoleMessages('error', [/\[slack\] setProfile failed for some workspaces/],
        'Slack lehnt die Profiländerung absichtlich ab.');
      mockedAxios.create.mockReturnValue({
        post: vi.fn().mockRejectedValue(new Error('Network error')),
      } as any);

      slackService = new SlackService(mockToken);
      const success = await slackService.setProfile(':shark:', 'Working');

      expect(success).toBe(false);
    });

    it('should set profile for all tokens', async () => {
      vi.useFakeTimers();
      const postMock = vi.fn()
        .mockResolvedValueOnce({ data: { ok: true } })
        .mockResolvedValueOnce({ data: { ok: true } });

      mockedAxios.create.mockReturnValue({
        post: postMock,
        get: vi.fn().mockResolvedValue({
          data: { ok: true, profile: { status_emoji: ':shark:', status_text: 'Working' } },
        }),
      } as any);

      slackService = new SlackService(mockTokens);
      const result = slackService.setProfile(':shark:', 'Working');
      await vi.runAllTimersAsync();

      await expect(result).resolves.toBe(true);
      expect(postMock).toHaveBeenCalledTimes(2);
    });

    it('should retry only workspaces that did not persist the profile', async () => {
      vi.useFakeTimers();
      const postMock = vi.fn().mockResolvedValue({ data: { ok: true } });
      const getMock = vi.fn()
        .mockResolvedValueOnce({
          data: { ok: true, profile: { status_emoji: ':shark:', status_text: 'Working' } },
        })
        .mockResolvedValueOnce({
          data: { ok: true, profile: { status_emoji: ':bulb:', status_text: 'Old status' } },
        });

      mockedAxios.create.mockReturnValue({ post: postMock, get: getMock } as any);
      slackService = new SlackService(mockTokens);

      const result = slackService.setProfile(':shark:', 'Working');
      await vi.runAllTimersAsync();

      await expect(result).resolves.toBe(true);
      expect(postMock).toHaveBeenCalledTimes(3);
      expect(postMock.mock.calls[2][2].headers.Authorization).toBe('Bearer xoxb-token2');
    });

    it('should continue verifying workspaces when one read-back fails', async () => {
      vi.useFakeTimers();
      const postMock = vi.fn().mockResolvedValue({ data: { ok: true } });
      const getMock = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          data: { ok: true, profile: { status_emoji: ':bulb:', status_text: 'Old status' } },
        });

      mockedAxios.create.mockReturnValue({ post: postMock, get: getMock } as any);
      slackService = new SlackService(mockTokens);

      const result = slackService.setProfile(':shark:', 'Working');
      await vi.runAllTimersAsync();

      await expect(result).resolves.toBe(true);
      expect(getMock).toHaveBeenCalledTimes(2);
      expect(postMock).toHaveBeenCalledTimes(4);
    });
  });

  describe('setPresence', () => {
    beforeEach(() => {
      slackService = new SlackService(mockToken);
    });

    it('should set presence to auto', async () => {
      mockedAxios.create.mockReturnValue({
        post: vi.fn().mockResolvedValue({
          data: { ok: true },
        }),
      } as any);

      slackService = new SlackService(mockToken);
      const success = await slackService.setPresence('auto');

      expect(success).toBe(true);
    });

    it('should set presence to away', async () => {
      mockedAxios.create.mockReturnValue({
        post: vi.fn().mockResolvedValue({
          data: { ok: true },
        }),
      } as any);

      slackService = new SlackService(mockToken);
      const success = await slackService.setPresence('away');

      expect(success).toBe(true);
    });
  });

  describe('getPresence', () => {
    beforeEach(() => {
      slackService = new SlackService(mockToken);
    });

    it('should return current presence', async () => {
      mockedAxios.create.mockReturnValue({
        get: vi.fn().mockResolvedValue({
          data: { ok: true, presence: 'auto' },
        }),
      } as any);

      slackService = new SlackService(mockToken);
      const presence = await slackService.getPresence();

      expect(presence).toBe('auto');
    });

    it('should return null on error', async () => {
      expectConsoleMessages('error', [/\[slack\] getPresence failed/],
        'Slack-Anwesenheitsabfrage schlägt absichtlich fehl.');
      mockedAxios.create.mockReturnValue({
        get: vi.fn().mockRejectedValue(new Error('Network error')),
      } as any);

      slackService = new SlackService(mockToken);
      const presence = await slackService.getPresence();

      expect(presence).toBeNull();
    });
  });

  describe('enableDND', () => {
    beforeEach(() => {
      slackService = new SlackService(mockToken);
    });

    it('should enable DND successfully', async () => {
      mockedAxios.create.mockReturnValue({
        post: vi.fn().mockResolvedValue({
          data: { ok: true },
        }),
      } as any);

      slackService = new SlackService(mockToken);
      const success = await slackService.enableDND(1440);

      expect(success).toBe(true);
    });

    it('should use default 1440 minutes if not specified', async () => {
      const postMock = vi.fn().mockResolvedValue({
        data: { ok: true },
      });

      mockedAxios.create.mockReturnValue({
        post: postMock,
      } as any);

      slackService = new SlackService(mockToken);
      await slackService.enableDND();

      // Verify the post method was called
      expect(postMock).toHaveBeenCalled();
      expect(postMock.mock.calls[0][0]).toContain('dnd.setSnooze');
    });
  });

  describe('disableDND', () => {
    beforeEach(() => {
      slackService = new SlackService(mockToken);
    });

    it('should disable DND successfully', async () => {
      mockedAxios.create.mockReturnValue({
        post: vi.fn().mockResolvedValue({
          data: { ok: true },
        }),
      } as any);

      slackService = new SlackService(mockToken);
      const success = await slackService.disableDND();

      expect(success).toBe(true);
    });
  });
});
