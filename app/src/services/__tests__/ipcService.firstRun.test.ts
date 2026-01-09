import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IPCService } from '../ipcService';

describe('IPCService - First Run & Auto Launch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isFirstRun', () => {
    it('should exist as a static method', () => {
      expect(typeof IPCService.isFirstRun).toBe('function');
    });

    it('should return false when not running in Electron', async () => {
      const originalWindow = global.window;
      Object.defineProperty(global, 'window', {
        value: {},
        writable: true,
      });

      const result = await IPCService.isFirstRun();
      expect(result).toBe(false);

      Object.defineProperty(global, 'window', {
        value: originalWindow,
        writable: true,
      });
    });

    it('should call window.electronAPI.isFirstRun if available', async () => {
      const mockIsFirstRun = vi.fn().mockResolvedValue({
        success: true,
        isFirstRun: true,
      });

      const mockElectronAPI = {
        isFirstRun: mockIsFirstRun,
      };

      const originalWindow = global.window;
      Object.defineProperty(global, 'window', {
        value: {
          electronAPI: mockElectronAPI,
        },
        writable: true,
      });

      const result = await IPCService.isFirstRun();

      expect(mockIsFirstRun).toHaveBeenCalled();
      expect(result).toBe(true);

      Object.defineProperty(global, 'window', {
        value: originalWindow,
        writable: true,
      });
    });

    it('should return false when isFirstRun IPC call fails', async () => {
      const mockIsFirstRun = vi.fn().mockResolvedValue({
        success: false,
        error: 'Failed to check',
      });

      const mockElectronAPI = {
        isFirstRun: mockIsFirstRun,
      };

      const originalWindow = global.window;
      Object.defineProperty(global, 'window', {
        value: {
          electronAPI: mockElectronAPI,
        },
        writable: true,
      });

      const result = await IPCService.isFirstRun();
      expect(result).toBe(false);

      Object.defineProperty(global, 'window', {
        value: originalWindow,
        writable: true,
      });
    });
  });

  describe('completeFirstRun', () => {
    it('should exist as a static method', () => {
      expect(typeof IPCService.completeFirstRun).toBe('function');
    });

    it('should return false when not running in Electron', async () => {
      const originalWindow = global.window;
      Object.defineProperty(global, 'window', {
        value: {},
        writable: true,
      });

      const result = await IPCService.completeFirstRun();
      expect(result).toBe(false);

      Object.defineProperty(global, 'window', {
        value: originalWindow,
        writable: true,
      });
    });

    it('should call window.electronAPI.completeFirstRun if available', async () => {
      const mockCompleteFirstRun = vi.fn().mockResolvedValue({
        success: true,
      });

      const mockElectronAPI = {
        completeFirstRun: mockCompleteFirstRun,
      };

      const originalWindow = global.window;
      Object.defineProperty(global, 'window', {
        value: {
          electronAPI: mockElectronAPI,
        },
        writable: true,
      });

      const result = await IPCService.completeFirstRun();

      expect(mockCompleteFirstRun).toHaveBeenCalled();
      expect(result).toBe(true);

      Object.defineProperty(global, 'window', {
        value: originalWindow,
        writable: true,
      });
    });

    it('should return false when completeFirstRun IPC call fails', async () => {
      const mockCompleteFirstRun = vi.fn().mockResolvedValue({
        success: false,
        error: 'Failed to complete',
      });

      const mockElectronAPI = {
        completeFirstRun: mockCompleteFirstRun,
      };

      const originalWindow = global.window;
      Object.defineProperty(global, 'window', {
        value: {
          electronAPI: mockElectronAPI,
        },
        writable: true,
      });

      const result = await IPCService.completeFirstRun();
      expect(result).toBe(false);

      Object.defineProperty(global, 'window', {
        value: originalWindow,
        writable: true,
      });
    });
  });

  describe('setAutoLaunch', () => {
    it('should exist as a static method', () => {
      expect(typeof IPCService.setAutoLaunch).toBe('function');
    });

    it('should call window.electronAPI.setAutoLaunch with enabled value', async () => {
      const mockSetAutoLaunch = vi.fn().mockResolvedValue({
        success: true,
      });

      const mockElectronAPI = {
        setAutoLaunch: mockSetAutoLaunch,
      };

      const originalWindow = global.window;
      Object.defineProperty(global, 'window', {
        value: {
          electronAPI: mockElectronAPI,
        },
        writable: true,
      });

      await IPCService.setAutoLaunch(true);

      expect(mockSetAutoLaunch).toHaveBeenCalledWith(true);

      Object.defineProperty(global, 'window', {
        value: originalWindow,
        writable: true,
      });
    });
  });

  describe('getAutoLaunch', () => {
    it('should exist as a static method', () => {
      expect(typeof IPCService.getAutoLaunch).toBe('function');
    });

    it('should return enabled status from IPC', async () => {
      const mockGetAutoLaunch = vi.fn().mockResolvedValue({
        success: true,
        enabled: true,
      });

      const mockElectronAPI = {
        getAutoLaunch: mockGetAutoLaunch,
      };

      const originalWindow = global.window;
      Object.defineProperty(global, 'window', {
        value: {
          electronAPI: mockElectronAPI,
        },
        writable: true,
      });

      const result = await IPCService.getAutoLaunch();

      expect(result).toBe(true);

      Object.defineProperty(global, 'window', {
        value: originalWindow,
        writable: true,
      });
    });
  });
});
