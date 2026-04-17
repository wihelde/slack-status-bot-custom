import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IPCService } from '../ipcService';

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
    });

    expect(mockGetAppSnapshot).toHaveBeenCalledTimes(1);

    Object.defineProperty(global, 'window', {
      value: originalWindow,
      writable: true,
    });
  });
});
