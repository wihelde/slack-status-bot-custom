import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SlackService } from '../slack';
import axios from 'axios';

vi.mock('axios');
const mockedAxios = axios as any;

describe('SlackService', () => {
  let slackService: SlackService;
  const mockToken = 'xoxb-test-token';
  const mockTokens = ['xoxb-token1', 'xoxb-token2'];

  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress expected console.error messages in tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
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
      mockedAxios.create.mockReturnValue({
        get: vi.fn().mockRejectedValue(new Error('Network error')),
      } as any);

      slackService = new SlackService(mockToken);
      const profile = await slackService.getProfile();

      expect(profile).toBeNull();
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
      mockedAxios.create.mockReturnValue({
        post: vi.fn().mockResolvedValue({
          data: { ok: true },
        }),
      } as any);

      slackService = new SlackService(mockToken);
      const success = await slackService.setProfile(':shark:', 'Working');

      expect(success).toBe(true);
    });

    it('should handle API error', async () => {
      mockedAxios.create.mockReturnValue({
        post: vi.fn().mockRejectedValue(new Error('Network error')),
      } as any);

      slackService = new SlackService(mockToken);
      const success = await slackService.setProfile(':shark:', 'Working');

      expect(success).toBe(false);
    });

    it('should set profile for all tokens', async () => {
      const postMock = vi.fn()
        .mockResolvedValueOnce({ data: { ok: true } })
        .mockResolvedValueOnce({ data: { ok: true } });

      mockedAxios.create.mockReturnValue({
        post: postMock,
      } as any);

      slackService = new SlackService(mockTokens);
      const success = await slackService.setProfile(':shark:', 'Working');

      expect(success).toBe(true);
      expect(postMock).toHaveBeenCalledTimes(2);
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

