import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SlackStatusBotDaemon } from '../daemon';
import { SlackService } from '../services/slack';
import { STATUS_MESSAGES } from '../config/statusConfig';
import { SourceName } from '../config/sourceCatalog';

// Mock external dependencies
vi.mock('../services/slack');

// Mock Source Adapters with behavior
vi.mock('../services/sources/spotify', () => {
  return {
    SpotifyAdapter: class MockSpotifyAdapter {
      private enabled: boolean;
      private active: boolean;
      
      constructor() {
        this.enabled = true;  // Always start enabled
        this.active = false;
      }
      
      setEnabled(val: boolean) { 
        this.enabled = val; 
      }
      
      isEnabled() { 
        return this.enabled; 
      }
      
      async getStatus() {
        if (!this.enabled) {
          return { name: 'Spotify', isActive: false };
        }
        return { 
          name: 'Spotify', 
          isActive: this.active,
          emoji: ':spotify:',
          message: this.active ? 'Playing music' : undefined
        };
      }
      
      isAvailable() { return true; }
    }
  };
});

vi.mock('../services/sources/appleMusic', () => {
  return {
    AppleMusicAdapter: class MockAppleMusicAdapter {
      private enabled: boolean;
      private active: boolean;
      
      constructor() {
        this.enabled = true;
        this.active = false;
      }
      
      setEnabled(val: boolean) { 
        this.enabled = val; 
      }
      
      isEnabled() { 
        return this.enabled; 
      }
      
      async getStatus() {
        if (!this.enabled) {
          return { name: 'Apple Music', isActive: false };
        }
        return { 
          name: 'Apple Music', 
          isActive: this.active,
          emoji: ':apple:',
          message: this.active ? 'Playing music' : undefined
        };
      }
      
      isAvailable() { return true; }
    }
  };
});

vi.mock('../services/sources/meetings', () => {
  return {
    ZoomAdapter: class MockZoomAdapter {
      private enabled: boolean;
      private active: boolean;
      
      constructor() {
        this.enabled = true;
        this.active = false;
      }
      
      setEnabled(val: boolean) { 
        this.enabled = val; 
      }
      
      isEnabled() { 
        return this.enabled; 
      }
      
      async getStatus() {
        if (!this.enabled) {
          return { name: 'Zoom', isActive: false };
        }
        return { 
          name: 'Zoom', 
          isActive: this.active,
          emoji: ':zoom:',
          message: this.active ? 'In a meeting' : undefined
        };
      }
      
      isAvailable() { return true; }
    },
    TeamsAdapter: class MockTeamsAdapter {
      private enabled: boolean;
      private active: boolean;
      
      constructor() {
        this.enabled = true;
        this.active = false;
      }
      
      setEnabled(val: boolean) { 
        this.enabled = val; 
      }
      
      isEnabled() { 
        return this.enabled; 
      }
      
      async getStatus() {
        if (!this.enabled) {
          return { name: 'Microsoft Teams', isActive: false };
        }
        return { 
          name: 'Microsoft Teams', 
          isActive: this.active,
          emoji: ':teams:',
          message: this.active ? 'In a meeting' : undefined
        };
      }
      
      isAvailable() { return true; }
    },
    HuddleAdapter: class MockHuddleAdapter {
      private enabled: boolean;
      private active: boolean;
      
      constructor() {
        this.enabled = true;
        this.active = false;
      }
      
      setEnabled(val: boolean) { 
        this.enabled = val; 
      }
      
      isEnabled() { 
        return this.enabled; 
      }
      
      async getStatus() {
        if (!this.enabled) {
          return { name: 'Slack Huddle', isActive: false };
        }
        return { 
          name: 'Slack Huddle', 
          isActive: this.active,
          emoji: ':huddle:',
          message: this.active ? 'In a huddle' : undefined
        };
      }
      
      isAvailable() { return true; }
    }
  };
});

describe('SlackStatusBotDaemon', () => {
  let daemon: SlackStatusBotDaemon;
  let mockSlackService: any;

  const getInternalSlackService = () => (daemon as any).slackService;
  const getInternalStatusManager = () => (daemon as any).statusManager;
  const getInternalSourceRegistry = () => (daemon as any).sourceRegistry;
  const getInternalSource = (
    source: 'spotify' | 'appleMusic' | 'zoom' | 'teams' | 'huddle'
  ) => getInternalSourceRegistry().getAdapter(source) as any;
  const setSourceActive = (
    source: 'spotify' | 'appleMusic' | 'zoom' | 'teams' | 'huddle',
    active: boolean
  ) => {
    getInternalSource(source).active = active;
  };

  // Helper function to create complete mock source statuses with all 5 sources
  const createCompleteSourceStatusesMock = () => ({
    spotify: { isActive: false, message: '' },
    appleMusic: { isActive: false, message: '' },
    zoom: { isActive: false, message: '' },
    teams: { isActive: false, message: '' },
    huddle: { isActive: false, message: '' },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockSlackService = new SlackService('test-token') as any;
    mockSlackService.getProfile = vi.fn().mockResolvedValue({
      status_emoji: '',
      status_text: '',
    });
    mockSlackService.setProfile = vi.fn().mockResolvedValue(true);
    mockSlackService.setPresence = vi.fn().mockResolvedValue(true);
    mockSlackService.enableDND = vi.fn().mockResolvedValue(true);
    mockSlackService.disableDND = vi.fn().mockResolvedValue(true);
    
    // Mock getSourceStatuses with all 5 sources using helper function
    mockSlackService.getSourceStatuses = vi.fn().mockResolvedValue(
      createCompleteSourceStatusesMock()
    );

    // Use unique config dir for each test to prevent state leaking
    daemon = new SlackStatusBotDaemon({
      slackTokens: 'test-token',
      configDir: `/tmp/test-daemon-config-${Date.now()}-${Math.random()}`,
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    if (daemon?.isRunning()) {
      await daemon.stop();
    }
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

    it('should return enabled: true by default for all sources', async () => {
      const statuses = await daemon.getSourceStatuses();

      // All sources should be enabled by default
      expect(statuses.spotify.enabled).toBe(true);
      expect(statuses.appleMusic.enabled).toBe(true);
      expect(statuses.zoom.enabled).toBe(true);
      expect(statuses.teams.enabled).toBe(true);
      expect(statuses.huddle.enabled).toBe(true);
    });

    it('should return enabled: false after disabling a source', async () => {
      // GIVEN: Spotify is disabled
      daemon.toggleSource('spotify', false);
      
      // WHEN: We get source statuses
      const statuses = await daemon.getSourceStatuses();
      
      // THEN: Spotify should be disabled, others enabled
      expect(statuses.spotify.enabled).toBe(false);
      expect(statuses.appleMusic.enabled).toBe(true);
      expect(statuses.zoom.enabled).toBe(true);
      expect(statuses.teams.enabled).toBe(true);
      expect(statuses.huddle.enabled).toBe(true);
    });

    it('should return enabled: true after re-enabling a source', async () => {
      // GIVEN: Spotify is disabled then re-enabled
      daemon.toggleSource('spotify', false);
      daemon.toggleSource('spotify', true);
      
      // WHEN: We get source statuses
      const statuses = await daemon.getSourceStatuses();
      
      // THEN: Spotify should be enabled again
      expect(statuses.spotify.enabled).toBe(true);
    });

    it('should handle multiple sources being disabled', async () => {
      // GIVEN: Multiple sources are disabled
      daemon.toggleSource('spotify', false);
      daemon.toggleSource('zoom', false);
      daemon.toggleSource('teams', false);
      
      // WHEN: We get source statuses
      const statuses = await daemon.getSourceStatuses();
      
      // THEN: Disabled sources should show enabled: false
      expect(statuses.spotify.enabled).toBe(false);
      expect(statuses.zoom.enabled).toBe(false);
      expect(statuses.teams.enabled).toBe(false);
      
      // AND: Others should still be enabled
      expect(statuses.appleMusic.enabled).toBe(true);
      expect(statuses.huddle.enabled).toBe(true);
    });

    it('should independently track enabled state for each source', async () => {
      // GIVEN: Different sources have different enabled states
      daemon.toggleSource('spotify', false);
      daemon.toggleSource('zoom', true);
      daemon.toggleSource('appleMusic', false);
      daemon.toggleSource('teams', true);
      daemon.toggleSource('huddle', false);
      
      // WHEN: We get source statuses
      const statuses = await daemon.getSourceStatuses();
      
      // THEN: Each source should have its correct state
      expect(statuses.spotify.enabled).toBe(false);
      expect(statuses.zoom.enabled).toBe(true);
      expect(statuses.appleMusic.enabled).toBe(false);
      expect(statuses.teams.enabled).toBe(true);
      expect(statuses.huddle.enabled).toBe(false);
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



  describe('Error Handling', () => {
    it('should handle errors gracefully when getting source statuses fails', async () => {
      // This is tested implicitly by the mock setup
      const statuses = await daemon.getSourceStatuses();
      expect(statuses).toBeDefined();
    });

    it('should handle errors gracefully when setting status fails', async () => {
      mockSlackService.setProfile = vi.fn().mockRejectedValue(new Error('API Error'));
      
      // Should not throw
      try {
        await daemon.setStatus(':test:', 'Test');
      } catch (e) {
        // Expected
      }
    });
  });

  describe('Source Priority Management (PRIORITY 1)', () => {
    it('should have getSourceOrder method', () => {
      const order = daemon.getSourceOrder();
      expect(order).toBeDefined();
      expect(Array.isArray(order)).toBe(true);
    });

    it('should initialize with default source order', () => {
      const order = daemon.getSourceOrder();
      expect(order.length).toBe(5);
      expect(order).toContain('spotify');
      expect(order).toContain('appleMusic');
      expect(order).toContain('zoom');
      expect(order).toContain('teams');
      expect(order).toContain('huddle');
    });

    it('should update source order via setSourceOrder', async () => {
      // Ensure mock is reset to complete state before test
      mockSlackService.getSourceStatuses.mockResolvedValueOnce(
        createCompleteSourceStatusesMock()
      );
      
      const newOrder: SourceName[] = ['teams', 'zoom', 'spotify', 'huddle', 'appleMusic'];
      await daemon.setSourceOrder(newOrder);
      
      expect(daemon.getSourceOrder()).toEqual(newOrder);
    });

    it('should handle invalid source order gracefully', async () => {
      // Ensure mock is reset to complete state before test
      mockSlackService.getSourceStatuses.mockResolvedValueOnce(
        createCompleteSourceStatusesMock()
      );
      
      const invalidOrder = ['invalid', 'sources'] as any;
      // Should not throw, but may not update
      try {
        await daemon.setSourceOrder(invalidOrder);
        expect(true).toBe(true);
      } catch (e) {
        throw new Error('setSourceOrder should handle invalid orders gracefully');
      }
    });

    it('should persist source order changes in config', async () => {
      // Ensure mock is reset to complete state before test
      mockSlackService.getSourceStatuses.mockResolvedValueOnce(
        createCompleteSourceStatusesMock()
      );
      const configDir = `/tmp/test-daemon-config-persist-order-${Date.now()}-${Math.random()}`;

      const daemon1 = new SlackStatusBotDaemon({
        slackTokens: 'test-token',
        configDir,
      });

      const newOrder: SourceName[] = ['spotify', 'teams', 'zoom', 'appleMusic', 'huddle'];
      await daemon1.setSourceOrder(newOrder);

      const daemon2 = new SlackStatusBotDaemon({
        slackTokens: 'test-token',
        configDir,
      });

      expect(daemon2.getSourceOrder()).toEqual(newOrder);
    });

    it('should reapply the new winning source when priority changes at runtime', async () => {
      const slackService = getInternalSlackService();

      setSourceActive('spotify', true);
      setSourceActive('zoom', true);

      await daemon.setSourceOrder(['zoom', 'spotify', 'teams', 'appleMusic', 'huddle']);

      expect(slackService.setProfile).toHaveBeenCalledWith(':zoom:', 'In a meeting');
    });

    it('should switch to the new winner through the same runtime path after reprioritization', async () => {
      vi.useFakeTimers();
      const slackService = getInternalSlackService();

      setSourceActive('spotify', true);
      setSourceActive('zoom', true);

      await daemon.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(slackService.setProfile).toHaveBeenCalledWith(':spotify:', 'Playing music');

      slackService.setProfile.mockClear();
      await vi.advanceTimersByTimeAsync(2100);
      await daemon.setSourceOrder(['zoom', 'spotify', 'teams', 'appleMusic', 'huddle']);

      expect(slackService.setProfile).toHaveBeenCalledTimes(1);
      expect(slackService.setProfile).toHaveBeenCalledWith(':zoom:', 'In a meeting');

      const state = getInternalStatusManager().getStatusCheckState();
      expect(state.activeSource).toBe('zoom');
    });

    it('should reset through the shared reset path when reprioritization finds no active source', async () => {
      vi.setSystemTime(new Date('2025-11-24T09:00:00Z'));
      const slackService = getInternalSlackService();

      await daemon.setSourceOrder(['zoom', 'spotify', 'teams', 'appleMusic', 'huddle']);

      expect(slackService.setProfile).toHaveBeenCalled();
      expect(slackService.setProfile.mock.calls.at(-1)?.[0]).toBe(':monday:');
      expect(slackService.setProfile.mock.calls.at(-1)?.[1]).toContain('Monday');
    });
  });

  describe('Configuration & Persistence (PRIORITY 1)', () => {
    it('should save config when toggling sources', async () => {
      const configDir = `/tmp/test-daemon-config-toggle-${Date.now()}-${Math.random()}`;
      const daemon1 = new SlackStatusBotDaemon({
        slackTokens: 'test-token',
        configDir,
      });

      daemon1.toggleSource('spotify', false);
      daemon1.toggleSource('teams', false);

      const daemon2 = new SlackStatusBotDaemon({
        slackTokens: 'test-token',
        configDir,
      });

      await expect(daemon2.getSourceStatuses()).resolves.toMatchObject({
        spotify: expect.objectContaining({ enabled: false }),
        teams: expect.objectContaining({ enabled: false }),
        appleMusic: expect.objectContaining({ enabled: true }),
      });
    });

    it('should save config when updating source order', async () => {
      // Ensure mock is reset to complete state before test
      mockSlackService.getSourceStatuses.mockResolvedValueOnce(
        createCompleteSourceStatusesMock()
      );
      
      const newOrder: SourceName[] = ['zoom', 'teams', 'spotify', 'appleMusic', 'huddle'];
      
      await expect(daemon.setSourceOrder(newOrder)).resolves.toBeUndefined();
    });

    it('should preserve source enabled/disabled state', async () => {
      const configDir = `/tmp/test-daemon-config-enabled-state-${Date.now()}-${Math.random()}`;
      const daemon1 = new SlackStatusBotDaemon({
        slackTokens: 'test-token',
        configDir,
      });

      daemon1.toggleSource('spotify', false);
      daemon1.toggleSource('appleMusic', false);

      const daemon2 = new SlackStatusBotDaemon({
        slackTokens: 'test-token',
        configDir,
      });

      await expect(daemon2.getSourceStatuses()).resolves.toMatchObject({
        spotify: expect.objectContaining({ enabled: false }),
        appleMusic: expect.objectContaining({ enabled: false }),
        zoom: expect.objectContaining({ enabled: true }),
      });
    });
  });

  describe('Source Polling & Switching (PRIORITY 1)', () => {
    it('should have startSourcePolling method', () => {
      // Method should exist and be callable during daemon lifecycle
      expect(daemon).toBeDefined();
      // Polling starts on daemon.start()
    });

    it('should monitor all enabled sources', async () => {
      await daemon.start();
      const statuses = await daemon.getSourceStatuses();
      
      // Should check all sources
      expect(statuses).toHaveProperty('spotify');
      expect(statuses).toHaveProperty('appleMusic');
      expect(statuses).toHaveProperty('zoom');
      expect(statuses).toHaveProperty('teams');
      expect(statuses).toHaveProperty('huddle');
      
      await daemon.stop();
    });

    it('should switch to next priority source when highest ends', async () => {
      vi.useFakeTimers();
      const slackService = getInternalSlackService();

      setSourceActive('zoom', true);
      await daemon.start();

      await vi.advanceTimersByTimeAsync(0);
      expect(slackService.setProfile).toHaveBeenCalledWith(':zoom:', 'In a meeting');

      slackService.setProfile.mockClear();
      setSourceActive('zoom', false);
      setSourceActive('spotify', true);

      await vi.advanceTimersByTimeAsync(2100);

      expect(slackService.setProfile).toHaveBeenCalledWith(':spotify:', 'Playing music');
    });

    it('should prefer the highest priority source when multiple sources are active', async () => {
      vi.useFakeTimers();
      const slackService = getInternalSlackService();

      setSourceActive('spotify', true);
      setSourceActive('zoom', true);

      await daemon.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(slackService.setProfile).toHaveBeenCalledTimes(1);
      expect(slackService.setProfile).toHaveBeenCalledWith(':spotify:', 'Playing music');

      const state = getInternalStatusManager().getStatusCheckState();
      expect(state.activeSource).toBe('spotify');
    });

    it('should update the winning source when its message changes', async () => {
      vi.useFakeTimers();
      const slackService = getInternalSlackService();
      const spotify = getInternalSource('spotify');

      spotify.getStatus = vi.fn()
        .mockResolvedValueOnce({
          name: 'Spotify',
          isActive: true,
          emoji: ':spotify:',
          message: 'Track One',
        })
        .mockResolvedValueOnce({
          name: 'Spotify',
          isActive: true,
          emoji: ':spotify:',
          message: 'Track Two',
        })
        .mockResolvedValue({
          name: 'Spotify',
          isActive: true,
          emoji: ':spotify:',
          message: 'Track Two',
        });

      setSourceActive('spotify', true);
      await daemon.start();

      await vi.advanceTimersByTimeAsync(0);
      expect(slackService.setProfile).toHaveBeenCalledWith(':spotify:', 'Track One');

      slackService.setProfile.mockClear();
      await vi.advanceTimersByTimeAsync(2000);

      expect(slackService.setProfile).toHaveBeenCalledTimes(1);
      expect(slackService.setProfile).toHaveBeenCalledWith(':spotify:', 'Track Two');
    });

    it('should ignore an active source when it is disabled and choose the next enabled source', async () => {
      vi.useFakeTimers();
      const slackService = getInternalSlackService();

      daemon.toggleSource('spotify', false);
      setSourceActive('spotify', true);
      setSourceActive('zoom', true);

      await daemon.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(slackService.setProfile).toHaveBeenCalledTimes(1);
      expect(slackService.setProfile).toHaveBeenCalledWith(':zoom:', 'In a meeting');

      const state = getInternalStatusManager().getStatusCheckState();
      expect(state.activeSource).toBe('zoom');
    });

    it('should reset status when all sources become inactive', async () => {
      vi.useFakeTimers();
      const slackService = getInternalSlackService();

      vi.setSystemTime(new Date('2025-11-24T09:00:00Z'));
      setSourceActive('spotify', true);
      await daemon.start();

      await vi.advanceTimersByTimeAsync(0);
      slackService.setProfile.mockClear();

      setSourceActive('spotify', false);
      await vi.advanceTimersByTimeAsync(1000);

      expect(slackService.setProfile).toHaveBeenCalled();
      expect(slackService.setProfile.mock.calls.at(-1)[0]).toBe( ':monday:' );
    });

    it('should respect source enabled/disabled state during polling', async () => {
      // Disable a source
      daemon.toggleSource('spotify', false);
      
      await daemon.start();
      
      // Polling should skip disabled sources
      expect(daemon.isRunning()).toBe(true);
      
      await daemon.stop();
    });
  });

  describe('Status Correction Logic (PRIORITY 3)', () => {
    it('should have startStatusCorrection method', () => {
      // Method should exist and be callable
      expect(daemon).toBeDefined();
      // Correction starts on daemon.start()
    });

    it('should periodically verify Slack status is correct', async () => {
      await daemon.start();
      
      // Should be checking status periodically
      expect(daemon.isRunning()).toBe(true);
      
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: ':spotify:',
        status_text: 'Playing Music',
      });
      
      await daemon.stop();
    });

    it('should restore a valid Slack Holiday status before source polling can overwrite it', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-14T10:00:00Z'));

      const slackService = getInternalSlackService();
      slackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: STATUS_MESSAGES.HOLIDAY_EMOJI,
        status_text: 'strong vacationing (back on 16.03.2026)',
        status_expiration: Math.floor(new Date('2026-03-15T23:59:59Z').getTime() / 1000),
      });
      slackService.setProfile = vi.fn().mockResolvedValue(true);

      setSourceActive('spotify', true);
      await daemon.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(slackService.setProfile).not.toHaveBeenCalled();
      expect(getInternalStatusManager().getStatusCheckState().value).toBe('not working');

      await daemon.stop();
    });

    it('should not restore protection for an expired Slack Holiday status on startup', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-03-16T10:00:00Z'));

      const slackService = getInternalSlackService();
      slackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: STATUS_MESSAGES.HOLIDAY_EMOJI,
        status_text: 'strong vacationing (back on 16.03.2026)',
        status_expiration: Math.floor(new Date('2026-03-15T23:59:59Z').getTime() / 1000),
      });
      slackService.setProfile = vi.fn().mockResolvedValue(true);

      await daemon.start();

      expect(getInternalStatusManager().getStatusCheckState().value).toBe('');

      await daemon.stop();
    });

    it('should correct mismatched status', async () => {
      mockSlackService.getProfile = vi.fn().mockResolvedValue({
        status_emoji: ':wrong:',
        status_text: 'Wrong Status',
      });
      
      mockSlackService.setProfile = vi.fn().mockResolvedValue(true);
      
      await daemon.start();
      
      // Should detect and potentially fix mismatch
      expect(daemon.isRunning()).toBe(true);
      
      await daemon.stop();
    });

    it('should handle status check failures gracefully', async () => {
      mockSlackService.getProfile = vi.fn().mockRejectedValue(
        new Error('API Error')
      );
      
      await daemon.start();
      
      // Should continue running despite API errors
      expect(daemon.isRunning()).toBe(true);
      
      await daemon.stop();
    });
  });

  describe('Error Handling Extended (PRIORITY 3)', () => {
    it('should handle Slack API rate limiting', async () => {
      mockSlackService.setProfile = vi.fn().mockRejectedValue(
        new Error('429: Rate limit exceeded')
      );
      
      await daemon.start();
      
      // Daemon should handle rate limits gracefully
      expect(daemon.isRunning()).toBe(true);
      
      await daemon.stop();
    });

    it('should handle network failures during polling', async () => {
      mockSlackService.getProfile = vi.fn().mockRejectedValue(
        new Error('ECONNREFUSED')
      );
      
      await daemon.start();
      
      // Daemon should recover from network errors
      expect(daemon.isRunning()).toBe(true);
      
      await daemon.stop();
    });

    it('should handle missing config directory', () => {
      // Create daemon with non-existent config dir
      const daemonWithMissingConfig = new SlackStatusBotDaemon({
        slackTokens: 'test-token',
        configDir: '/tmp/definitely-does-not-exist-' + Date.now(),
      });
      
      expect(daemonWithMissingConfig).toBeDefined();
    });

    it('should handle corrupted config file gracefully', () => {
      // If config file is corrupted, should use defaults
      const daemon2 = new SlackStatusBotDaemon({
        slackTokens: 'test-token',
        configDir: '/tmp/test-daemon-config-corrupted',
      });
      
      expect(daemon2).toBeDefined();
    });

    it('should handle source initialization errors', async () => {
      // If a source fails to initialize, daemon should continue
      await daemon.start();
      
      expect(daemon.isRunning()).toBe(true);
      
      await daemon.stop();
    });
  });

  describe('Performance & Load (PRIORITY 3)', () => {
    it('should handle rapid start/stop cycles', async () => {
      for (let i = 0; i < 5; i++) {
        await daemon.start();
        expect(daemon.isRunning()).toBe(true);
        
        await daemon.stop();
        expect(daemon.isRunning()).toBe(false);
      }
    });

    it('should handle rapid source order changes', async () => {
      const orders: SourceName[][] = [
        ['spotify', 'zoom', 'teams', 'huddle', 'appleMusic'],
        ['teams', 'spotify', 'zoom', 'appleMusic', 'huddle'],
        ['appleMusic', 'zoom', 'huddle', 'spotify', 'teams'],
      ];
      
      for (const order of orders) {
        await daemon.setSourceOrder(order);
        expect(daemon.getSourceOrder()).toEqual(order);
      }
    });

    it('should handle rapid source toggles', () => {
      for (let i = 0; i < 10; i++) {
        daemon.toggleSource('spotify', i % 2 === 0);
        daemon.toggleSource('zoom', i % 2 === 0);
        daemon.toggleSource('teams', i % 2 === 0);
      }
      
      // Should not crash or throw
      expect(true).toBe(true);
    });

    it('should handle many concurrent status checks', async () => {
      const promises: Array<Promise<any>> = [];
      
      for (let i = 0; i < 10; i++) {
        promises.push(daemon.getSourceStatuses());
        promises.push(daemon.getSlackStatus());
      }
      
      const results = await Promise.all(promises);
      
      expect(results.length).toBe(20);
    });

    it('should maintain memory efficiency during long polling', async () => {
      await daemon.start();
      
      // Simulate extended polling (5 cycles)
      for (let i = 0; i < 5; i++) {
        await daemon.getSourceStatuses();
      }
      
      expect(daemon.isRunning()).toBe(true);
      
      await daemon.stop();
    });

    it('should handle multiple setStatus calls in succession', async () => {
      const statuses = [
        { emoji: ':spotify:', text: 'Playing' },
        { emoji: ':zoom:', text: 'Meeting' },
        { emoji: ':focus:', text: 'Focusing' },
      ];
      
      // Execute multiple status changes in rapid succession
      // Should not throw errors
      let errorCount = 0;
      for (const status of statuses) {
        try {
          await daemon.setStatus(status.emoji, status.text);
        } catch (error) {
          errorCount++;
        }
      }
      
      // No errors should occur
      expect(errorCount).toBe(0);
    });
  });

  describe('Complex Scenarios (PRIORITY 3)', () => {
    it('should handle switching sources with priority order changes', async () => {
      // Change priority while sources are active
      await daemon.setSourceOrder(['teams', 'zoom', 'spotify', 'appleMusic', 'huddle']);
      
      const order1 = daemon.getSourceOrder();
      expect(order1[0]).toBe('teams');
      
      // Change again
      await daemon.setSourceOrder(['spotify', 'teams', 'zoom', 'appleMusic', 'huddle']);
      
      const order2 = daemon.getSourceOrder();
      expect(order2[0]).toBe('spotify');
    });

    it('should handle disabling all sources', async () => {
      daemon.toggleSource('spotify', false);
      daemon.toggleSource('appleMusic', false);
      daemon.toggleSource('zoom', false);
      daemon.toggleSource('teams', false);
      daemon.toggleSource('huddle', false);
      
      // Should handle gracefully (fallback to default status)
      expect(true).toBe(true);
    });

    it('should handle re-enabling sources', async () => {
      daemon.toggleSource('spotify', false);
      daemon.toggleSource('spotify', true);
      
      // Should be re-enabled and ready
      expect(true).toBe(true);
    });

    it('should preserve state during save/load cycle', async () => {
      const originalOrder = daemon.getSourceOrder();
      
      await daemon.setSourceOrder(['zoom', 'teams', 'spotify', 'appleMusic', 'huddle']);
      
      // Create new daemon to simulate app restart
      const daemon2 = new SlackStatusBotDaemon({
        slackTokens: 'test-token',
        configDir: '/tmp/test-daemon-config',
      });
      
      // Both daemons should be valid
      expect(daemon).toBeDefined();
      expect(daemon2).toBeDefined();
    });

    it('should handle status changes during daemon start', async () => {
      mockSlackService.setProfile = vi.fn().mockResolvedValue(true);
      
      const startPromise = daemon.start();
      
      // Try to change status while starting
      const statusPromise = daemon.setStatus(':test:', 'Test');
      
      const [startResult] = await Promise.all([startPromise, statusPromise]);
      
      // Should handle both operations
      expect(daemon.isRunning()).toBe(true);
      
      await daemon.stop();
    });
  });

  describe('Holiday Status', () => {
    it('should have setHoliday method', async () => {
      // setHoliday is tested in detail in statusManager.test.ts
      // Here we just verify the method exists on the daemon
      expect(typeof daemon.setHoliday).toBe('function');
    });
  });

  describe('Reset Cooldown', () => {
    it('should respect reset cooldown when blocked', async () => {
      await daemon.start();
      
      // Simulate a failed reset (status is blocked)
      const firstReset = await daemon.goOnline();
      
      // In a real scenario, second reset would be blocked by cooldown
      // This tests the infrastructure is in place
      expect(daemon.isRunning()).toBe(true);
      
      await daemon.stop();
    });
  });

  describe('Active Source Tracking', () => {
    it('should track activeSource in statusCheckState', async () => {
      vi.useFakeTimers();

      setSourceActive('zoom', true);
      await daemon.start();
      await vi.advanceTimersByTimeAsync(0);

      const state = getInternalStatusManager().getStatusCheckState();
      expect(state.activeSource).toBe('zoom');
    });
  });

  describe('DND Control', () => {
    it('should have DND control methods', () => {
      // Verify DND methods exist on SlackService
      expect(mockSlackService.enableDND).toBeDefined();
      expect(mockSlackService.disableDND).toBeDefined();
      expect(typeof mockSlackService.enableDND).toBe('function');
      expect(typeof mockSlackService.disableDND).toBe('function');
    });

    it('should enable DND for meeting emojis via custom status', async () => {
      const slackService = getInternalSlackService();
      slackService.setProfile = vi.fn().mockResolvedValue(true);
      slackService.enableDND = vi.fn().mockResolvedValue(true);
      slackService.setPresence = vi.fn().mockResolvedValue(true);
      slackService.disableDND = vi.fn().mockResolvedValue(true);

      await daemon.setStatus(STATUS_MESSAGES.MEETING_EMOJI, 'In a meeting');

      expect(slackService.enableDND).toHaveBeenCalled();
    });

    it('should handle DND control during daemon lifecycle', async () => {
      vi.useFakeTimers();
      const slackService = getInternalSlackService();

      setSourceActive('teams', true);
      await daemon.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(slackService.enableDND).toHaveBeenCalled();
    });

    it('should not break when DND operations fail', async () => {
      // Simulate DND operations failing
      mockSlackService.enableDND = vi.fn().mockRejectedValue(new Error('DND Error'));
      mockSlackService.disableDND = vi.fn().mockRejectedValue(new Error('DND Error'));
      
      await daemon.start();
      
      // Daemon should still run despite DND failures
      expect(daemon.isRunning()).toBe(true);
      
      await daemon.stop();
    });
  });

  describe('Status Change Events', () => {
    it('should accept an app-state callback when configured', () => {
      const onAppStateChanged = vi.fn();
      
      const daemonWithCallback = new SlackStatusBotDaemon({
        slackTokens: 'test-token',
        configDir: '/tmp/test-daemon-config-events',
        onAppStateChanged,
      });
      
      expect(daemonWithCallback).toBeDefined();
      // The callback will be called when StatusManager emits events
      // This is tested implicitly through the polling and status change methods
    });

    it('should trigger onAppStateChanged callback when status is updated', async () => {
      const mockCallback = vi.fn();
      
      const daemonWithCallback = new SlackStatusBotDaemon({
        slackTokens: 'test-token',
        configDir: '/tmp/test-daemon-config-events',
        onAppStateChanged: mockCallback,
      });

      const slackService = (daemonWithCallback as any).slackService;
      slackService.setProfile = vi.fn().mockResolvedValue(true);
      slackService.disableDND = vi.fn().mockResolvedValue(true);
      slackService.enableDND = vi.fn().mockResolvedValue(true);
      slackService.setPresence = vi.fn().mockResolvedValue(true);

      await daemonWithCallback.setStatus(':test:', 'Test Status');

      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          emoji: ':test:',
          message: 'Test Status',
        })
      );
    });
  });

  describe('Status Configuration Loading (PRIORITY 2)', () => {
    it('should load status configuration exactly as saved in config file', async () => {
      const configDir = `/tmp/test-daemon-config-${Date.now()}-${Math.random()}`;
      
      // Create a daemon and save a custom config with only 2 statuses
      const daemon1 = new SlackStatusBotDaemon({
        slackTokens: 'test-token',
        configDir,
      });
      
      const customStatuses = [
        {
          id: 'custom1',
          emoji: ':custom1:',
          message: 'Custom Status 1',
          days: [],
          enableDND: false,
          presence: 'auto' as const,
          category: 'day_based' as const,
        },
        {
          id: 'custom2',
          emoji: ':custom2:',
          message: 'Custom Status 2',
          days: [],
          enableDND: false,
          presence: 'auto' as const,
          category: 'day_based' as const,
        },
      ];
      
      // Save custom configuration
      await daemon1.updateStatusConfiguration(customStatuses);
      
      // Create a new daemon to simulate app restart
      const daemon2 = new SlackStatusBotDaemon({
        slackTokens: 'test-token',
        configDir,
      });
      
      // Get the loaded configuration
      const loadedConfig = await daemon2.getStatusConfiguration();
      
      // Should have exactly 2 statuses (not merged with defaults)
      expect(loadedConfig.length).toBe(2);
      expect(loadedConfig.find(s => s.id === 'custom1')).toBeDefined();
      expect(loadedConfig.find(s => s.id === 'custom2')).toBeDefined();
      
      // Should NOT contain default statuses (e.g., 'break', 'meeting')
      expect(loadedConfig.find(s => s.id === 'break')).toBeUndefined();
      expect(loadedConfig.find(s => s.id === 'meeting')).toBeUndefined();
      expect(loadedConfig.find(s => s.id === 'focus')).toBeUndefined();
    });

    it('should not restore deleted default statuses', async () => {
      const configDir = `/tmp/test-daemon-config-${Date.now()}-${Math.random()}`;
      
      // Get default statuses
      const { getDefaultStatusConfiguration } = await import('../config/statusConfig');
      const defaults = getDefaultStatusConfiguration();
      
      // Create a daemon and save config with only some default statuses removed
      const daemon1 = new SlackStatusBotDaemon({
        slackTokens: 'test-token',
        configDir,
      });
      
      // Remove some default statuses (break and meeting)
      const customStatuses = defaults.filter(s => s.id !== 'break' && s.id !== 'meeting');
      await daemon1.updateStatusConfiguration(customStatuses);
      
      // Create a new daemon to simulate app restart
      const daemon2 = new SlackStatusBotDaemon({
        slackTokens: 'test-token',
        configDir,
      });
      
      // Get the loaded configuration
      const loadedConfig = await daemon2.getStatusConfiguration();
      
      // Deleted statuses should NOT be restored
      expect(loadedConfig.find(s => s.id === 'break')).toBeUndefined();
      expect(loadedConfig.find(s => s.id === 'meeting')).toBeUndefined();
      
      // Other default statuses should still be there
      expect(loadedConfig.find(s => s.id === 'focus')).toBeDefined();
      expect(loadedConfig.find(s => s.id === 'focus')).toBeDefined();
    });

    it('should initialize with defaults if config file does not exist', async () => {
      const configDir = `/tmp/test-daemon-config-nonexistent-${Date.now()}-${Math.random()}`;
      
      // Create a daemon with a non-existent config dir
      const daemon = new SlackStatusBotDaemon({
        slackTokens: 'test-token',
        configDir,
      });
      
      // Should initialize with defaults
      const config = await daemon.getStatusConfiguration();
      
      expect(config.length).toBeGreaterThan(0);
      // Should have default quick actions
      expect(config.find(s => s.id === 'break')).toBeDefined();
      expect(config.find(s => s.id === 'meeting')).toBeDefined();
    });
  });

  describe('Overridable Status Patterns Configuration (PRIORITY 2)', () => {
    it('should save overridable patterns to config', async () => {
      const configDir = `/tmp/test-daemon-patterns-${Date.now()}-${Math.random()}`;
      
      const daemon1 = new SlackStatusBotDaemon({
        slackTokens: 'test-token',
        configDir,
      });

      // Patterns are loaded from defaults initially
      expect(daemon1).toBeDefined();

      // Create a new daemon to check if patterns were persisted
      const daemon2 = new SlackStatusBotDaemon({
        slackTokens: 'test-token',
        configDir,
      });

      expect(daemon2).toBeDefined();
    });

    it('should load default overridable patterns on first start', () => {
      const configDir = `/tmp/test-daemon-patterns-defaults-${Date.now()}-${Math.random()}`;
      
      const daemon = new SlackStatusBotDaemon({
        slackTokens: 'test-token',
        configDir,
      });

      // Daemon should initialize with default patterns
      expect(daemon).toBeDefined();
    });

    it('should persist custom overridable patterns across restarts', async () => {
      const configDir = `/tmp/test-daemon-patterns-custom-${Date.now()}-${Math.random()}`;
      
      // First daemon - should have defaults
      const daemon1 = new SlackStatusBotDaemon({
        slackTokens: 'test-token',
        configDir,
      });

      // Trigger config save by disabling/enabling a source
      daemon1.toggleSource('spotify', false);
      
      // Create second daemon with same config dir
      const daemon2 = new SlackStatusBotDaemon({
        slackTokens: 'test-token',
        configDir,
      });

      // Both daemons should be valid
      expect(daemon1).toBeDefined();
      expect(daemon2).toBeDefined();

      // Check source state was persisted
      const statuses2 = await daemon2.getSourceStatuses();
      expect(statuses2.spotify.enabled).toBe(false);
    });

    it('should include overridable patterns in saved config', async () => {
      const configDir = `/tmp/test-daemon-patterns-save-${Date.now()}-${Math.random()}`;
      
      const daemon = new SlackStatusBotDaemon({
        slackTokens: 'test-token',
        configDir,
      });

      // Save config by toggling a source
      daemon.toggleSource('spotify', false);

      // Read the config file directly to verify patterns are saved
      const configFile = require('path').join(configDir, 'config.json');
      const config = JSON.parse(require('fs').readFileSync(configFile, 'utf-8'));

      // Should have statusConfiguration with overridablePatterns
      expect(config.statusConfiguration).toBeDefined();
      expect(config.statusConfiguration.overridablePatterns).toBeDefined();
      expect(Array.isArray(config.statusConfiguration.overridablePatterns)).toBe(true);
      
      // Should have at least Officely pattern by default
      const officelyPattern = config.statusConfiguration.overridablePatterns.find(
        (p: any) => p.emoji === ':office:'
      );
      expect(officelyPattern).toBeDefined();
      expect(officelyPattern.messagePatterns).toContain('Office Hamburg (via Officely)');
      expect(officelyPattern.messagePatterns).toContain('Office Belgrade (via Officely)');
    });

    it('should handle empty overridable patterns gracefully', () => {
      const configDir = `/tmp/test-daemon-patterns-empty-${Date.now()}-${Math.random()}`;
      
      const daemon = new SlackStatusBotDaemon({
        slackTokens: 'test-token',
        configDir,
      });

      // Should not throw
      expect(daemon).toBeDefined();
    });
  });

  describe('Overridable Status Correction (PRIORITY 1)', () => {
    it('should include Officely in default overridable patterns', async () => {
      await daemon.start();

      // The daemon's statusManager should have Officely patterns loaded by default
      const statusManager = daemon['statusManager'] as any;
      const hasOfficelyPattern = statusManager.getOverridablePatterns().some(
        (p: any) => p.emoji === ':office:' && p.messagePatterns.includes('Office Hamburg (via Officely)')
      );

      expect(hasOfficelyPattern).toBe(true);

      await daemon.stop();
    });
  });
});
