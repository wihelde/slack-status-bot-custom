import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IPCService } from '../ipcService';

describe('IPCService - Tray Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('onOpenHolidayModal', () => {
    it('should exist as a static method', () => {
      expect(typeof IPCService.onOpenHolidayModal).toBe('function');
    });

    it('should call window.electronAPI.onOpenHolidayModal if available', () => {
      const mockCallback = vi.fn();
      const mockCleanup = vi.fn();
      const mockElectronAPI = {
        onOpenHolidayModal: vi.fn(() => mockCleanup),
      };

      // Mock the window object
      const originalWindow = global.window;
      Object.defineProperty(global, 'window', {
        value: {
          electronAPI: mockElectronAPI,
        },
        writable: true,
      });

      const cleanup = IPCService.onOpenHolidayModal(mockCallback);

      expect(mockElectronAPI.onOpenHolidayModal).toHaveBeenCalledWith(mockCallback);
      expect(cleanup).toBe(mockCleanup);

      // Restore window
      Object.defineProperty(global, 'window', {
        value: originalWindow,
        writable: true,
      });
    });

    it('should handle missing electronAPI gracefully', () => {
      const mockCallback = vi.fn();

      // Mock window without electronAPI
      const originalWindow = global.window;
      Object.defineProperty(global, 'window', {
        value: {},
        writable: true,
      });

      // Should not throw
      expect(() => {
        IPCService.onOpenHolidayModal(mockCallback);
      }).not.toThrow();

      // Restore window
      Object.defineProperty(global, 'window', {
        value: originalWindow,
        writable: true,
      });
    });

    it('should log warning when not running in Electron', () => {
      const consoleSpy = vi.spyOn(console, 'warn');
      const mockCallback = vi.fn();

      // Mock window without electronAPI
      const originalWindow = global.window;
      Object.defineProperty(global, 'window', {
        value: {},
        writable: true,
      });

      IPCService.onOpenHolidayModal(mockCallback);

      expect(consoleSpy).toHaveBeenCalledWith('Not running in Electron');

      consoleSpy.mockRestore();
      Object.defineProperty(global, 'window', {
        value: originalWindow,
        writable: true,
      });
    });
  });

  describe('Integration with other IPC methods', () => {
    it('should return cleanup functions consistently', () => {
      // Verify that onOpenHolidayModal has same pattern as onStatusChanged
      expect(typeof IPCService.onOpenHolidayModal).toBe('function');
      expect(typeof IPCService.onStatusChanged).toBe('function');

      // Both should return cleanup functions
      const mockCleanup1 = vi.fn();
      const mockCleanup2 = vi.fn();
      const mockElectronAPI = {
        onOpenHolidayModal: vi.fn(() => mockCleanup1),
        onStatusChanged: vi.fn(() => mockCleanup2),
      };

      const originalWindow = global.window;
      Object.defineProperty(global, 'window', {
        value: {
          electronAPI: mockElectronAPI,
        },
        writable: true,
      });

      const result1 = IPCService.onOpenHolidayModal(() => {});
      const result2 = IPCService.onStatusChanged(() => {});

      expect(typeof result1).toBe('function');
      expect(typeof result2).toBe('function');

      Object.defineProperty(global, 'window', {
        value: originalWindow,
        writable: true,
      });
    });

    it('should return undefined when not in Electron', () => {
      const originalWindow = global.window;
      Object.defineProperty(global, 'window', {
        value: {},
        writable: true,
      });

      const result1 = IPCService.onOpenHolidayModal(() => {});
      const result2 = IPCService.onStatusChanged(() => {});

      expect(result1).toBeUndefined();
      expect(result2).toBeUndefined();

      Object.defineProperty(global, 'window', {
        value: originalWindow,
        writable: true,
      });
    });
  });
});
