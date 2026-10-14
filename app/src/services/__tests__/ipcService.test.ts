import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IPCService } from '../ipcService';
import { expectConsoleMessages } from '../../__tests__/helpers/expectedConsole';

describe('IPCService - Tray Integration', () => {
  const setWindowMock = (value: unknown) => {
    const originalWindow = global.window;
    Object.defineProperty(global, 'window', {
      value,
      writable: true,
    });

    return () => {
      Object.defineProperty(global, 'window', {
        value: originalWindow,
        writable: true,
      });
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('onOpenHolidayModal', () => {
    it('should call window.electronAPI.onOpenHolidayModal if available', () => {
      const mockCallback = vi.fn();
      const mockCleanup = vi.fn();
      const mockElectronAPI = {
        onOpenHolidayModal: vi.fn(() => mockCleanup),
      };

      const restoreWindow = setWindowMock({
        electronAPI: mockElectronAPI,
      });

      const cleanup = IPCService.onOpenHolidayModal(mockCallback);

      expect(mockElectronAPI.onOpenHolidayModal).toHaveBeenCalledWith(mockCallback);
      expect(cleanup).toBe(mockCleanup);
      restoreWindow();
    });

    it('returns undefined and logs a warning outside Electron', () => {
      expectConsoleMessages('warn', [/^\[IPCService\] Not running in Electron$/],
        'Electron fehlt absichtlich; der IPC-Ersatzpfad wird geprüft.');
      const mockCallback = vi.fn();
      const restoreWindow = setWindowMock({});

      expect(IPCService.onOpenHolidayModal(mockCallback)).toBeUndefined();

      restoreWindow();
    });
  });

  describe('Integration with other IPC methods', () => {
    it('returns cleanup functions consistently across renderer subscriptions', () => {
      const mockCleanup1 = vi.fn();
      const mockCleanup2 = vi.fn();
      const mockElectronAPI = {
        onOpenHolidayModal: vi.fn(() => mockCleanup1),
        onAppSnapshotChanged: vi.fn(() => mockCleanup2),
      };

      const restoreWindow = setWindowMock({
        electronAPI: mockElectronAPI,
      });

      const result1 = IPCService.onOpenHolidayModal(() => {});
      const result2 = IPCService.onAppSnapshotChanged(() => {});

      expect(typeof result1).toBe('function');
      expect(typeof result2).toBe('function');
      restoreWindow();
    });

    it('returns undefined for renderer subscriptions when Electron is unavailable', () => {
      expectConsoleMessages('warn', [/^\[IPCService\] Not running in Electron$/],
        'Electron fehlt absichtlich; der IPC-Ersatzpfad wird geprüft.');
      const restoreWindow = setWindowMock({});

      const result1 = IPCService.onOpenHolidayModal(() => {});
      const result2 = IPCService.onAppSnapshotChanged(() => {});

      expect(result1).toBeUndefined();
      expect(result2).toBeUndefined();
      restoreWindow();
    });
  });
});
