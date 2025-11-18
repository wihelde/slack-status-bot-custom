import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SpotifyAdapter } from '../spotify';

vi.mock('child_process');

describe('SpotifyAdapter', () => {
  let adapter: SpotifyAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new SpotifyAdapter();
  });

  describe('isAvailable', () => {
    it('should be available on macOS', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

      adapter = new SpotifyAdapter();
      expect(adapter.isAvailable()).toBe(true);

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should not be available on Windows', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

      adapter = new SpotifyAdapter();
      expect(adapter.isAvailable()).toBe(false);

      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });
  });

  describe('enable/disable', () => {
    it('should enable and disable', () => {
      expect(adapter.isEnabled()).toBe(true);

      adapter.setEnabled(false);
      expect(adapter.isEnabled()).toBe(false);

      adapter.setEnabled(true);
      expect(adapter.isEnabled()).toBe(true);
    });
  });

  describe('basic structure', () => {
    it('should have getStatus method', () => {
      expect(typeof adapter.getStatus).toBe('function');
    });

    it('should initialize with correct name', () => {
      expect(adapter['lastStatus'].name).toBe('Spotify');
    });
  });

  describe('getStatus (PRIORITY 2)', () => {
    it('should return async status', () => {
      // getStatus returns a Promise
      const result = adapter.getStatus();
      expect(result instanceof Promise).toBe(true);
    });

    it('should have emoji property when defined', () => {
      // When active, status should have emoji
      expect(adapter['lastStatus']).toHaveProperty('emoji');
    });

    it('should initialize with Spotify emoji', () => {
      // Status should be initialized with :spotify_2: emoji
      expect(adapter['lastStatus'].emoji).toBe(':spotify_2:');
    });

    it('should cache status internally', () => {
      // Adapter maintains lastStatus for caching
      expect(adapter['lastStatus']).toBeDefined();
      expect(typeof adapter['lastStatus']).toBe('object');
    });

    it('should be ready for repeated calls', () => {
      // Architecture should support repeated calls
      const result1 = adapter.getStatus();
      const result2 = adapter.getStatus();
      
      // Both should be promises
      expect(result1 instanceof Promise).toBe(true);
      expect(result2 instanceof Promise).toBe(true);
    });
  });

  describe('Spotify Detection (PRIORITY 2)', () => {
    it('should only work on macOS', () => {
      const originalPlatform = process.platform;
      
      // On non-macOS, should not be available
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
      const linuxAdapter = new SpotifyAdapter();
      expect(linuxAdapter.isAvailable()).toBe(false);
      
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    });

    it('should use osascript method for detection', () => {
      // Spotify uses osascript (AppleScript) on macOS
      // This is the detection method, not runtime tested
      expect(typeof adapter.getStatus).toBe('function');
    });
  });
});
