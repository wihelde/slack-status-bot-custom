import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IPCService } from '../ipcService';

describe('IPCService - First Run & Auto Launch', () => {
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

  describe('completeFirstRun', () => {
    it('returns false when not running in Electron', async () => {
      const restoreWindow = setWindowMock({});
      await expect(IPCService.completeFirstRun()).resolves.toBe(false);
      restoreWindow();
    });

    it('proxies the complete-first-run contract through the preload boundary', async () => {
      const mockCompleteFirstRun = vi.fn().mockResolvedValue({
        success: true,
      });
      const restoreWindow = setWindowMock({
        electronAPI: {
          completeFirstRun: mockCompleteFirstRun,
        },
      });

      const result = await IPCService.completeFirstRun();

      expect(mockCompleteFirstRun).toHaveBeenCalled();
      expect(result).toBe(true);
      restoreWindow();
    });

    it('returns false when the complete-first-run IPC call fails', async () => {
      const mockCompleteFirstRun = vi.fn().mockResolvedValue({
        success: false,
        error: 'Failed to complete',
      });
      const restoreWindow = setWindowMock({
        electronAPI: {
          completeFirstRun: mockCompleteFirstRun,
        },
      });

      await expect(IPCService.completeFirstRun()).resolves.toBe(false);
      restoreWindow();
    });
  });

  describe('setAutoLaunch', () => {
    it('passes the enabled flag through the auto-launch IPC boundary', async () => {
      const mockSetAutoLaunch = vi.fn().mockResolvedValue({
        success: true,
      });
      const restoreWindow = setWindowMock({
        electronAPI: {
          setAutoLaunch: mockSetAutoLaunch,
        },
      });

      await IPCService.setAutoLaunch(true);

      expect(mockSetAutoLaunch).toHaveBeenCalledWith(true);
      restoreWindow();
    });
  });

  describe('getAutoLaunch', () => {
    it('returns the enabled auto-launch status from IPC', async () => {
      const mockGetAutoLaunch = vi.fn().mockResolvedValue({
        success: true,
        data: {
          enabled: true,
        },
      });
      const restoreWindow = setWindowMock({
        electronAPI: {
          getAutoLaunch: mockGetAutoLaunch,
        },
      });

      await expect(IPCService.getAutoLaunch()).resolves.toBe(true);
      restoreWindow();
    });
  });
});
