import type { CustomStatusConfig } from '../config/statusConfig';
import { DEFAULT_SOURCE_ORDER, type SourceName } from '../config/sourceCatalog';
import type { AppSnapshot, AppSnapshotRefreshReason, AppSetupSnapshot } from '../contracts/appSnapshot';
import type { WorkspaceConnectionSummary } from '../contracts/ipc';
import {
  type AutoLaunchStatusPayload,
  IPC_CHANNELS,
  type IpcChannel,
  type IpcFailureResult,
  type IpcResult,
  type RendererLogLevel,
} from '../contracts/ipc';

interface IpcMainLike {
  handle: (
    channel: IpcChannel,
    handler: (_event: unknown, ...args: unknown[]) => Promise<IpcResult<unknown>>
  ) => void;
}

interface HostDaemon {
  goOnline: () => Promise<boolean>;
  goAway: () => Promise<boolean>;
  setStatus: (emoji: string, message: string) => Promise<boolean>;
  toggleSource: (source: SourceName, enabled: boolean) => void;
  setSourceOrder: (sourceOrder: SourceName[]) => Promise<void>;
  getSourceOrder: () => SourceName[];
  setHoliday: (returnDate: string) => Promise<boolean>;
  getStatusConfiguration: () => CustomStatusConfig[];
  updateStatusConfiguration: (statusConfig: CustomStatusConfig[]) => Promise<boolean>;
  resetStatusConfiguration: () => Promise<boolean>;
}

interface HostConfig {
  slackTokens?: string[];
  sourceOrder?: SourceName[];
  logLevel?: RendererLogLevel;
  hasCompletedFirstRun?: boolean;
}

export interface MainIpcDependencies {
  getConfig: () => HostConfig;
  getWorkspaceConnections?: () => WorkspaceConnectionSummary[];
  getWorkspaceConnectionError?: () => string | null;
  getOAuthMessage?: () => string | null;
  openSetupLink?: (link: string) => Promise<void>;
  reconnectWorkspace?: (teamId: string) => Promise<void>;
  removeWorkspace?: (teamId: string) => Promise<void>;
  refreshConfig: () => HostConfig;
  updateSourceOrder: (sourceOrder: SourceName[]) => void;
  getSetupSnapshot: () => AppSetupSnapshot;
  saveTokens: (tokens: string | string[]) => Promise<void>;
  deleteTokens: () => Promise<void>;
  markFirstRunComplete: () => Promise<void>;
  getDaemon: () => HostDaemon | null;
  emitAppSnapshotChanged: (reason: AppSnapshotRefreshReason) => void;
  refreshTrayMenu: () => void;
  openHolidayModal: () => void;
  getAppSnapshot: () => Promise<AppSnapshot>;
  getLogs: (lines: number) => string;
  clearLogs: () => void;
  setLogLevel: (level: RendererLogLevel) => RendererLogLevel;
  getLogLevel: () => RendererLogLevel;
  setAutoLaunch: (enabled: boolean) => Promise<AutoLaunchStatusPayload>;
  getAutoLaunch: () => Promise<AutoLaunchStatusPayload>;
  logStatusBridgeInfo: (message: string, data?: unknown) => void;
  logStatusBridgeError: (message: string, error: unknown) => void;
}

type Handler<TResult = undefined, TArgs extends unknown[] = []> = (...args: TArgs) => Promise<IpcResult<TResult>>;
type HandlerMap = Partial<Record<IpcChannel, Handler<unknown, unknown[]>>>;

function maskTokens(tokens: string[] | undefined): string[] {
  return Array.isArray(tokens)
    ? tokens.map(token => {
        if (token.length > 8) {
          return `${token.substring(0, 4)}...${token.substring(token.length - 4)}`;
        }

        return '****';
      })
    : [];
}

function toFailureResult(error: unknown): IpcFailureResult {
  return {
    success: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

export function createHandlerResult<TResult, TArgs extends unknown[]>(
  callback: (...args: TArgs) => Promise<IpcResult<TResult>>
): (_event: unknown, ...args: TArgs) => Promise<IpcResult<TResult>> {
  return async (_event, ...args) => {
    try {
      return await callback(...args);
    } catch (error) {
      return toFailureResult(error);
    }
  };
}

export function registerHandlerGroup(ipcMain: IpcMainLike, handlers: HandlerMap): void {
  Object.entries(handlers).forEach(([channel, handler]) => {
    if (handler) {
      ipcMain.handle(channel as IpcChannel, createHandlerResult(handler));
    }
  });
}

export function registerSetupIpcHandlers(
  ipcMain: IpcMainLike,
  dependencies: MainIpcDependencies
): void {
  const {
    getConfig,
    saveTokens,
    deleteTokens,
    markFirstRunComplete,
    getSetupSnapshot,
  } = dependencies;

  registerHandlerGroup(ipcMain, {
    [IPC_CHANNELS.getTokens]: async () => {
      const tokens = getConfig().slackTokens || [];
      dependencies.logStatusBridgeInfo('get-tokens requested', { count: tokens.length });
      return {
        success: true,
        data: {
          tokens: maskTokens(tokens),
          count: tokens.length,
          ...(dependencies.getWorkspaceConnections ? {
            connections: dependencies.getWorkspaceConnections(),
            connectionError: dependencies.getWorkspaceConnectionError?.() || null,
            oauthMessage: dependencies.getOAuthMessage?.() || null,
          } : {}),
        },
      };
    },
    [IPC_CHANNELS.getTokenStatus]: async () => {
      const tokens = getConfig().slackTokens || [];
      dependencies.logStatusBridgeInfo('get-token-status requested', {
        configured: Array.isArray(tokens) ? tokens.length > 0 : Boolean(tokens),
        count: Array.isArray(tokens) ? tokens.length : 0,
      });
      return {
        success: true,
        data: {
          configured: Array.isArray(tokens) ? tokens.length > 0 : Boolean(tokens),
        },
      };
    },
    [IPC_CHANNELS.saveTokens]: async tokens => {
      await saveTokens(tokens as string | string[]);
      return { success: true };
    },
    [IPC_CHANNELS.deleteTokens]: async () => {
      await deleteTokens();
      return { success: true };
    },
    [IPC_CHANNELS.completeFirstRun]: async () => {
      await markFirstRunComplete();
      return { success: true };
    },
    [IPC_CHANNELS.getSetupSnapshot]: async () => ({
      success: true,
      data: getSetupSnapshot(),
    }),
    [IPC_CHANNELS.openSetupLink]: async link => {
      if (typeof link !== 'string' || !dependencies.openSetupLink) throw new Error('Invalid Setup Link');
      await dependencies.openSetupLink(link);
      return { success: true };
    },
    [IPC_CHANNELS.reconnectWorkspace]: async teamId => {
      if (typeof teamId !== 'string' || !dependencies.reconnectWorkspace) throw new Error('Invalid workspace');
      await dependencies.reconnectWorkspace(teamId);
      return { success: true };
    },
    [IPC_CHANNELS.removeWorkspace]: async teamId => {
      if (typeof teamId !== 'string' || !dependencies.removeWorkspace) throw new Error('Invalid workspace');
      await dependencies.removeWorkspace(teamId);
      return { success: true };
    },
  });
}

function getConfigSourceOrder(getConfig: MainIpcDependencies['getConfig']): SourceName[] {
  return getConfig().sourceOrder || [...DEFAULT_SOURCE_ORDER];
}

export function registerStatusIpcHandlers(
  ipcMain: IpcMainLike,
  dependencies: MainIpcDependencies
): void {
  const {
    getDaemon,
    logStatusBridgeInfo,
    emitAppSnapshotChanged,
    refreshTrayMenu,
  } = dependencies;

  const requireDaemon = (): HostDaemon | null => {
    const daemon = getDaemon();
    if (!daemon) {
      return null;
    }

    return daemon;
  };

  registerHandlerGroup(ipcMain, {
    [IPC_CHANNELS.setStatus]: async (emoji, message) => {
      const daemon = requireDaemon();
      if (!daemon) {
        return { success: false, error: 'Daemon not initialized' };
      }

      logStatusBridgeInfo('Manual status update requested', { emoji, message });
      const success = await daemon.setStatus(emoji as string, message as string);
      return { success, data: success };
    },
    [IPC_CHANNELS.goOnline]: async () => {
      const daemon = requireDaemon();
      if (!daemon) {
        return { success: false, error: 'Daemon not initialized' };
      }

      logStatusBridgeInfo('Go-online requested');
      const success = await daemon.goOnline();
      return { success, data: success };
    },
    [IPC_CHANNELS.goAway]: async () => {
      const daemon = requireDaemon();
      if (!daemon) {
        return { success: false, error: 'Daemon not initialized' };
      }

      logStatusBridgeInfo('Go-away requested');
      const success = await daemon.goAway();
      return { success, data: success };
    },
    [IPC_CHANNELS.toggleSource]: async (source, enabled) => {
      const daemon = requireDaemon();
      if (!daemon) {
        return { success: false, error: 'Daemon not initialized' };
      }

      daemon.toggleSource(source as SourceName, enabled as boolean);
      emitAppSnapshotChanged('source-status');
      return { success: true };
    },
    [IPC_CHANNELS.setSourceOrder]: async sourceOrder => {
      const daemon = getDaemon();
      if (daemon) {
        await daemon.setSourceOrder(sourceOrder as SourceName[]);
      } else {
        dependencies.updateSourceOrder(sourceOrder as SourceName[]);
      }

      dependencies.refreshConfig();
      return { success: true };
    },
    [IPC_CHANNELS.getSourceOrder]: async () => ({
      success: true,
      data: getDaemon()?.getSourceOrder() || getConfigSourceOrder(dependencies.getConfig),
    }),
    [IPC_CHANNELS.setHoliday]: async returnDate => {
      const daemon = requireDaemon();
      if (!daemon) {
        return { success: false, error: 'Daemon not initialized' };
      }

      logStatusBridgeInfo('Holiday status requested', { returnDate });
      const success = await daemon.setHoliday(returnDate as string);
      return { success, data: success };
    },
    [IPC_CHANNELS.getStatusConfiguration]: async () => {
      const daemon = requireDaemon();
      if (!daemon) {
        return { success: false, error: 'Daemon not initialized' };
      }

      return { success: true, data: daemon.getStatusConfiguration() };
    },
    [IPC_CHANNELS.updateStatusConfiguration]: async statusConfig => {
      const daemon = requireDaemon();
      if (!daemon) {
        return { success: false, error: 'Daemon not initialized' };
      }

      const success = await daemon.updateStatusConfiguration(statusConfig as CustomStatusConfig[]);
      refreshTrayMenu();
      return { success };
    },
    [IPC_CHANNELS.resetStatusConfiguration]: async () => {
      const daemon = requireDaemon();
      if (!daemon) {
        return { success: false, error: 'Daemon not initialized' };
      }

      const success = await daemon.resetStatusConfiguration();
      refreshTrayMenu();
      return { success };
    },
    [IPC_CHANNELS.openHolidayModal]: async () => {
      dependencies.openHolidayModal();
      return { success: true };
    },
  });
}

export function registerSnapshotIpcHandlers(
  ipcMain: IpcMainLike,
  dependencies: MainIpcDependencies
): void {
  registerHandlerGroup(ipcMain, {
    [IPC_CHANNELS.getAppSnapshot]: async () => {
      const snapshot = await dependencies.getAppSnapshot();
      dependencies.logStatusBridgeInfo('get-app-snapshot requested', {
        daemonRunning: snapshot.daemon?.running,
        tokensConfigured: snapshot.setup?.tokensConfigured,
        isFirstRun: snapshot.setup?.isFirstRun,
      });
      return { success: true, data: snapshot };
    },
  });
}

export function registerLoggingIpcHandlers(
  ipcMain: IpcMainLike,
  dependencies: MainIpcDependencies
): void {
  registerHandlerGroup(ipcMain, {
    [IPC_CHANNELS.getLogs]: async (lines = 200) => ({
      success: true,
      data: dependencies.getLogs(lines as number),
    }),
    [IPC_CHANNELS.clearLogs]: async () => {
      dependencies.clearLogs();
      return { success: true };
    },
    [IPC_CHANNELS.setLogLevel]: async level => {
      const nextLevel = dependencies.setLogLevel(level as RendererLogLevel);
      return { success: true, data: nextLevel };
    },
    [IPC_CHANNELS.getLogLevel]: async () => ({
      success: true,
      data: dependencies.getLogLevel(),
    }),
  });
}

export function registerPlatformIpcHandlers(
  ipcMain: IpcMainLike,
  dependencies: MainIpcDependencies
): void {
  registerHandlerGroup(ipcMain, {
    [IPC_CHANNELS.setAutoLaunch]: async enabled => ({
      success: true,
      data: await dependencies.setAutoLaunch(enabled as boolean),
    }),
    [IPC_CHANNELS.getAutoLaunch]: async () => ({
      success: true,
      data: await dependencies.getAutoLaunch(),
    }),
  });
}

export function registerMainIpcHandlers(
  ipcMain: IpcMainLike,
  dependencies: MainIpcDependencies
): void {
  registerSetupIpcHandlers(ipcMain, dependencies);
  registerStatusIpcHandlers(ipcMain, dependencies);
  registerSnapshotIpcHandlers(ipcMain, dependencies);
  registerLoggingIpcHandlers(ipcMain, dependencies);
  registerPlatformIpcHandlers(ipcMain, dependencies);
}
