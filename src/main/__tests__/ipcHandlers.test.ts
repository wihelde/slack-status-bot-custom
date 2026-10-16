import { describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '../../contracts/ipc';
import { registerMainIpcHandlers } from '../ipcHandlers';

describe('ipcHandlers', () => {
  it('registers grouped main-process handlers against stable channel contracts', async () => {
    const handlers = new Map<string, Function>();
    const ipcMain = {
      handle: vi.fn((channel: string, handler: Function) => {
        handlers.set(channel, handler);
      }),
    };

    registerMainIpcHandlers(ipcMain, {
      getConfig: () => ({
        slackTokens: ['xoxb-secret-token'],
        sourceOrder: ['spotify', 'zoom'],
      }),
      refreshConfig: vi.fn(),
      updateSourceOrder: vi.fn(),
      getSetupSnapshot: () => ({ tokensConfigured: true, isFirstRun: false }),
      saveTokens: vi.fn(),
      deleteTokens: vi.fn(),
      markFirstRunComplete: vi.fn(),
      getDaemon: () => ({
        goOnline: vi.fn().mockResolvedValue(true),
        goAway: vi.fn().mockResolvedValue(true),
        setStatus: vi.fn().mockResolvedValue(true),
        toggleSource: vi.fn(),
        setSourceOrder: vi.fn(),
        getSourceOrder: () => ['spotify', 'zoom'],
        setHoliday: vi.fn().mockResolvedValue(true),
        getStatusConfiguration: () => [],
        updateStatusConfiguration: vi.fn().mockResolvedValue(true),
        resetStatusConfiguration: vi.fn().mockResolvedValue(true),
      }),
      emitAppSnapshotChanged: vi.fn(),
      refreshTrayMenu: vi.fn(),
      openHolidayModal: vi.fn(),
      getAppSnapshot: vi.fn().mockResolvedValue({ daemon: { running: true } }),
      getLogs: vi.fn().mockReturnValue('latest logs'),
      clearLogs: vi.fn(),
      setLogLevel: vi.fn().mockReturnValue('INFO'),
      getLogLevel: vi.fn().mockReturnValue('INFO'),
      setAutoLaunch: vi.fn().mockResolvedValue({ enabled: true }),
      getAutoLaunch: vi.fn().mockResolvedValue({ enabled: false }),
      logStatusBridgeInfo: vi.fn(),
      logStatusBridgeError: vi.fn(),
    });

    expect(handlers.has(IPC_CHANNELS.saveTokens)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.getAppSnapshot)).toBe(true);
    expect(handlers.has(IPC_CHANNELS.setAutoLaunch)).toBe(true);

    await expect(handlers.get(IPC_CHANNELS.getTokens)?.({})).resolves.toEqual({
      success: true,
      data: {
        tokens: ['xoxb...oken'],
        count: 1,
      },
    });

    await expect(handlers.get(IPC_CHANNELS.getAppSnapshot)?.({})).resolves.toEqual({
      success: true,
      data: {
        daemon: {
          running: true,
        },
      },
    });

    await expect(handlers.get(IPC_CHANNELS.setAutoLaunch)?.({}, true)).resolves.toEqual({
      success: true,
      data: {
        enabled: true,
      },
    });
  });
});
