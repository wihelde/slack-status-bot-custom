import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IPCService } from '../ipcService';
import type { AppSnapshotRefreshSignal } from '../../contracts/appSnapshot';

describe('IPCService - App Snapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when not running in Electron', async () => {
    const originalWindow = global.window;
    Object.defineProperty(global, 'window', {
      value: {},
      writable: true,
    });

    await expect(IPCService.getAppSnapshot()).resolves.toBeNull();

    Object.defineProperty(global, 'window', {
      value: originalWindow,
      writable: true,
    });
  });

  it('returns the consolidated snapshot when the preload boundary exposes it', async () => {
    const mockGetAppSnapshot = vi.fn().mockResolvedValue({
      success: true,
      data: {
        app: {
          version: '2.0.1',
        },
        status: {
          emoji: ':spotify_2:',
          text: 'Playing Music',
          stateCheckValue: 'spotify',
        },
        daemon: {
          running: true,
        },
        sources: {
          spotify: {
            name: 'spotify',
            enabled: true,
            isActive: true,
            message: 'Playing Music',
          },
          appleMusic: {
            name: 'appleMusic',
            enabled: true,
            isActive: false,
          },
          zoom: {
            name: 'zoom',
            enabled: true,
            isActive: false,
          },
          teams: {
            name: 'teams',
            enabled: true,
            isActive: false,
          },
          huddle: {
            name: 'huddle',
            enabled: true,
            isActive: false,
          },
        },
        update: null,
        setup: {
          tokensConfigured: true,
          isFirstRun: false,
        },
      },
    });

    const originalWindow = global.window;
    Object.defineProperty(global, 'window', {
      value: {
        electronAPI: {
          getAppSnapshot: mockGetAppSnapshot,
        },
      },
      writable: true,
    });

    await expect(IPCService.getAppSnapshot()).resolves.toMatchObject({
      status: {
        emoji: ':spotify_2:',
      },
      daemon: {
        running: true,
      },
      setup: {
        tokensConfigured: true,
      },
      app: {
        version: '2.0.1',
      },
    });

    expect(mockGetAppSnapshot).toHaveBeenCalledTimes(1);

    Object.defineProperty(global, 'window', {
      value: originalWindow,
      writable: true,
    });
  });

  it('subscribes to snapshot refresh signals through the preload boundary', () => {
    const mockCleanup = vi.fn();
    const callback = vi.fn();
    const mockOnAppSnapshotChanged = vi.fn(() => mockCleanup);

    const originalWindow = global.window;
    Object.defineProperty(global, 'window', {
      value: {
        electronAPI: {
          onAppSnapshotChanged: mockOnAppSnapshotChanged,
        },
      },
      writable: true,
    });

    const cleanup = IPCService.onAppSnapshotChanged(callback);
    const signal: AppSnapshotRefreshSignal = { reason: 'update' };

    expect(mockOnAppSnapshotChanged).toHaveBeenCalledTimes(1);
    expect(mockOnAppSnapshotChanged).toHaveBeenCalledWith(callback);
    expect(cleanup).toBe(mockCleanup);

    Object.defineProperty(global, 'window', {
      value: originalWindow,
      writable: true,
    });
  });
});
