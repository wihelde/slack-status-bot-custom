import { describe, expect, it, vi } from 'vitest';
import { createUpdateBridge, isNewerVersion } from '../updateBridge';

describe('updateBridge', () => {
  it('compares semver-like version strings consistently', () => {
    expect(isNewerVersion('2.0.1', '2.0.0')).toBe(true);
    expect(isNewerVersion('2.0.0', '2.0.0')).toBe(false);
    expect(isNewerVersion('1.9.9', '2.0.0')).toBe(false);
  });

  it('translates updater events into snapshot refreshes and tray updates', () => {
    const listeners = new Map<string, (payload?: any) => void>();
    const emitAppSnapshotChanged = vi.fn();
    const refreshTrayMenu = vi.fn();
    const onUpdateAvailable = vi.fn();
    const notifyUpdateAvailable = vi.fn();
    const bridge = createUpdateBridge({
      app: {
        getVersion: () => '2.0.0',
      },
      autoUpdater: {
        on: vi.fn((event: string, callback: (payload?: any) => void) => {
          listeners.set(event, callback);
        }),
      },
      isDev: false,
      log: vi.fn(),
      emitAppSnapshotChanged,
      onUpdateAvailable,
      refreshTrayMenu,
      notifyUpdateAvailable,
      request: vi.fn(),
      setIntervalFn: vi.fn(),
    });

    bridge.setupUpdateListeners();
    listeners.get('update-available')?.({
      version: '2.1.0',
      releaseDate: '2026-04-20T09:00:00.000Z',
    });

    expect(onUpdateAvailable).toHaveBeenCalledWith({
      version: '2.1.0',
      releaseDate: '2026-04-20T09:00:00.000Z',
    });
    expect(emitAppSnapshotChanged).toHaveBeenCalledWith('update');
    expect(refreshTrayMenu).toHaveBeenCalled();
    expect(notifyUpdateAvailable).toHaveBeenCalledWith({
      version: '2.1.0',
      releaseDate: '2026-04-20T09:00:00.000Z',
    });
  });

  it('notifies when a GitLab release check finds a newer version', async () => {
    const responseListeners = new Map<string, (chunk?: string) => void>();
    const request = vi.fn((_options, callback) => {
      callback({
        statusCode: 200,
        on: vi.fn((event: string, listener: (chunk?: string) => void) => {
          responseListeners.set(event, listener);
        }),
      });

      return {
        on: vi.fn(),
        end: vi.fn(() => {
          responseListeners.get('data')?.(JSON.stringify([
            {
              tag_name: 'v2.1.0',
              released_at: '2026-04-20T09:00:00.000Z',
            },
          ]));
          responseListeners.get('end')?.();
        }),
      };
    });
    const notifyUpdateAvailable = vi.fn();

    const bridge = createUpdateBridge({
      app: {
        getVersion: () => '2.0.0',
      },
      autoUpdater: {
        on: vi.fn(),
      },
      isDev: false,
      log: vi.fn(),
      emitAppSnapshotChanged: vi.fn(),
      onUpdateAvailable: vi.fn(),
      refreshTrayMenu: vi.fn(),
      notifyUpdateAvailable,
      request,
      setIntervalFn: vi.fn(),
    });

    bridge.checkForUpdates();
    await vi.waitFor(() => expect(notifyUpdateAvailable).toHaveBeenCalledWith({
      version: '2.1.0',
      releaseDate: '2026-04-20T09:00:00.000Z',
    }));
  });
});
