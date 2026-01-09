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
      const mockElectronAPI = {
        onOpenHolidayModal: vi.fn(),
      };

      // Mock the window object
      const originalWindow = global.window;
      Object.defineProperty(global, 'window', {
        value: {
          electronAPI: mockElectronAPI,
        },
        writable: true,
      });

      IPCService.onOpenHolidayModal(mockCallback);

      expect(mockElectronAPI.onOpenHolidayModal).toHaveBeenCalledWith(mockCallback);

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
    it('should have consistent error handling with other methods', () => {
      // Verify that onOpenHolidayModal has same pattern as onStatusChanged
      expect(typeof IPCService.onOpenHolidayModal).toBe('function');
      expect(typeof IPCService.onStatusChanged).toBe('function');

      // Both should return void (no return value)
      const mockElectronAPI = {
        onOpenHolidayModal: vi.fn(),
        onStatusChanged: vi.fn(),
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

      expect(result1).toBeUndefined();
      expect(result2).toBeUndefined();

      Object.defineProperty(global, 'window', {
        value: originalWindow,
        writable: true,
      });
    });
  });
});
