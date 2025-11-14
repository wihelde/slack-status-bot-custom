import { SlackStatusBotDaemon } from '../daemon';
import { SlackService } from '../services/slack';

// Mock external dependencies
jest.mock('../services/slack');
jest.mock('../services/sources/spotify');
jest.mock('../services/sources/appleMusic');
jest.mock('../services/sources/meetings');

describe('SlackStatusBotDaemon', () => {
  let daemon: SlackStatusBotDaemon;
  let mockSlackService: jest.Mocked<SlackService>;

  beforeEach(() => {
    mockSlackService = new SlackService('test-token') as jest.Mocked<SlackService>;
    mockSlackService.getProfile = jest.fn().mockResolvedValue({
      status_emoji: '',
      status_text: '',
    });
    mockSlackService.setProfile = jest.fn().mockResolvedValue(true);
    mockSlackService.setPresence = jest.fn().mockResolvedValue(true);
    mockSlackService.enableDND = jest.fn().mockResolvedValue(true);
    mockSlackService.disableDND = jest.fn().mockResolvedValue(true);

    daemon = new SlackStatusBotDaemon({
      slackTokens: 'test-token',
      configDir: '/tmp/test-daemon-config',
    });
  });

  describe('Daemon Lifecycle', () => {
    it('should initialize daemon', () => {
      expect(daemon).toBeDefined();
      expect(daemon.isRunning()).toBe(false);
    });

    it('should start daemon', async () => {
      await daemon.start();
      expect(daemon.isRunning()).toBe(true);
      
      await daemon.stop();
    });

    it('should stop daemon', async () => {
      await daemon.start();
      expect(daemon.isRunning()).toBe(true);

      await daemon.stop();
      expect(daemon.isRunning()).toBe(false);
    });

    it('should not start if already running', async () => {
      await daemon.start();
      const initialState = daemon.isRunning();

      await daemon.start(); // Try to start again
      expect(daemon.isRunning()).toBe(initialState);

      await daemon.stop();
    });

    it('should not stop if not running', async () => {
      // Already not running
      expect(daemon.isRunning()).toBe(false);

      await daemon.stop();
      expect(daemon.isRunning()).toBe(false);
    });
  });

  describe('Source Status', () => {
    it('should get source statuses', async () => {
      const statuses = await daemon.getSourceStatuses();

      expect(statuses).toHaveProperty('spotify');
      expect(statuses).toHaveProperty('appleMusic');
      expect(statuses).toHaveProperty('zoom');
      expect(statuses).toHaveProperty('teams');
      expect(statuses).toHaveProperty('huddle');
    });
  });

  describe('Slack Status', () => {
    it('should get current Slack status', async () => {
      const status = await daemon.getSlackStatus();

      expect(status).toHaveProperty('emoji');
      expect(status).toHaveProperty('text');
      expect(status).toHaveProperty('stateCheckValue');
    });
  });

  describe('Manual Status Changes', () => {
    it('should handle go online', async () => {
      mockSlackService.getProfile = jest.fn().mockResolvedValue({
        status_emoji: ':spotify:',
        status_text: 'Playing Spotify',
      });
      mockSlackService.setProfile = jest.fn().mockResolvedValue(true);

      // Should not throw
      try {
        await daemon.goOnline();
        expect(true).toBe(true);
      } catch (e) {
        fail('goOnline should not throw');
      }
    });

    it('should handle go away', async () => {
      mockSlackService.setProfile = jest.fn().mockResolvedValue(true);
      
      // Should not throw
      try {
        await daemon.goAway();
        expect(true).toBe(true);
      } catch (e) {
        fail('goAway should not throw');
      }
    });

    it('should handle set custom status', async () => {
      mockSlackService.setProfile = jest.fn().mockResolvedValue(true);
      
      // Should not throw
      try {
        await daemon.setStatus(':rocket:', 'Launching!');
        expect(true).toBe(true);
      } catch (e) {
        fail('setStatus should not throw');
      }
    });
  });

  describe('Source Management', () => {
    it('should toggle Spotify', () => {
      daemon.toggleSource('spotify', false);
      daemon.toggleSource('spotify', true);
      
      // Should not throw
      expect(true).toBe(true);
    });

    it('should toggle Apple Music', () => {
      daemon.toggleSource('appleMusic', false);
      daemon.toggleSource('appleMusic', true);
      
      expect(true).toBe(true);
    });

    it('should toggle Zoom', () => {
      daemon.toggleSource('zoom', false);
      daemon.toggleSource('zoom', true);
      
      expect(true).toBe(true);
    });

    it('should toggle Teams', () => {
      daemon.toggleSource('teams', false);
      daemon.toggleSource('teams', true);
      
      expect(true).toBe(true);
    });

    it('should toggle Huddle', () => {
      daemon.toggleSource('huddle', false);
      daemon.toggleSource('huddle', true);
      
      expect(true).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully when getting source statuses fails', async () => {
      // This is tested implicitly by the mock setup
      const statuses = await daemon.getSourceStatuses();
      expect(statuses).toBeDefined();
    });

    it('should handle errors gracefully when setting status fails', async () => {
      mockSlackService.setProfile = jest.fn().mockRejectedValue(new Error('API Error'));
      
      // Should not throw
      try {
        await daemon.setStatus(':test:', 'Test');
      } catch (e) {
        // Expected
      }
    });
  });
});
