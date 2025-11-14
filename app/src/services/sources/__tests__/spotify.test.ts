import { SpotifyAdapter } from '../spotify';

jest.mock('child_process');

describe('SpotifyAdapter', () => {
  let adapter: SpotifyAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
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
});
