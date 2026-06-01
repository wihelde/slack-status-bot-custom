import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import { execSync } from 'child_process';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { createAppConfigStore } from './config/appConfigStore';
import type { SourceName } from './config/sourceCatalog';
import { createDaemon, type SlackStatusBotDaemon } from './daemon';
import { type AppSnapshot, type AppSnapshotRefreshReason, type AppUpdateSnapshot } from './contracts/appSnapshot';
import type { RendererLogLevel } from './contracts/ipc';
import { createAppSnapshotProvider } from './main/appSnapshotProvider';
import { createAutoLaunchAdapter } from './main/autoLaunchAdapter';
import { registerMainIpcHandlers } from './main/ipcHandlers';
import { createMainLogger } from './main/logging';
import { createSnapshotBridge } from './main/snapshotBridge';
import { createTrayBridge } from './main/trayBridge';
import { createUpdateBridge } from './main/updateBridge';
import { createWindowLifecycle } from './main/windowLifecycle';

console.log('[Electron] Starting up...');

const isDev = process.env.NODE_ENV === 'development';
console.log('[Electron] isDev:', isDev);

const userDataDir =
  process.env.SLACK_STATUS_BOT_USER_DATA_DIR ||
  path.join(app.getPath('appData'), 'slack-status-bot');
app.setPath('userData', userDataDir);

if (process.env.SLACK_STATUS_BOT_REMOTE_DEBUGGING_PORT) {
  app.commandLine.appendSwitch(
    'remote-debugging-port',
    process.env.SLACK_STATUS_BOT_REMOTE_DEBUGGING_PORT
  );
}

const { log, logStatusBridgeInfo, logStatusBridgeError } = createMainLogger({
  app,
  fs,
  path,
  console,
});

interface RuntimeConfig {
  slackTokens?: string[];
  hasCompletedFirstRun?: boolean;
  logLevel?: RendererLogLevel;
  sourceOrder?: SourceName[];
}

const configStore = createAppConfigStore({
  configDir: app.getPath('userData'),
});
const electronApp = app as typeof app & { isQuitting?: boolean };

let daemon: SlackStatusBotDaemon | null = null;
let config: RuntimeConfig = {};
let currentLogLevel: RendererLogLevel = 'ERROR';
let updateAvailable: AppUpdateSnapshot | null = null;
let updateIntervalId: NodeJS.Timeout | null = null;

const loadConfig = (): RuntimeConfig => {
  try {
    return configStore.load();
  } catch (error) {
    console.error('Error loading config:', error);
    return {};
  }
};

const refreshConfig = (): RuntimeConfig => {
  config = loadConfig();
  currentLogLevel = config.logLevel || 'ERROR';
  log(
    `[Config] Loaded config ${JSON.stringify({
      configPath: configStore.getConfigPath(),
      tokenCount: Array.isArray(config.slackTokens) ? config.slackTokens.length : 0,
      hasCompletedFirstRun: config.hasCompletedFirstRun === true,
    })}`
  );
  return config;
};

const hasConfiguredTokens = (): boolean =>
  Array.isArray(config.slackTokens) && config.slackTokens.length > 0;

const getSetupSnapshot = () => ({
  tokensConfigured: hasConfiguredTokens(),
  isFirstRun: !config.hasCompletedFirstRun,
});

const windowLifecycle = createWindowLifecycle({
  app,
  BrowserWindow:
    BrowserWindow as unknown as Parameters<typeof createWindowLifecycle>[0]['BrowserWindow'],
  shell,
  isDev,
  preloadPath: path.join(__dirname, 'preload.js'),
  getStartUrl: () =>
    isDev
      ? process.env.ELECTRON_START_URL || 'http://localhost:3000'
      : `file://${path.join(__dirname, '../build/index.html')}`,
  hasTray: () => trayBridge.hasTray(),
  onClosed: () => {},
});

const snapshotBridge = createSnapshotBridge({
  sendToRenderer: (channel, payload) => windowLifecycle.send(channel, payload),
  logStatusBridgeInfo,
});

const trayBridge = createTrayBridge({
  app,
  Tray: Tray as unknown as Parameters<typeof createTrayBridge>[0]['Tray'],
  Menu,
  nativeImage,
  shell,
  fs,
  path,
  runtimeDirname: __dirname,
  log,
  showWindow: () => windowLifecycle.showWindow(),
  getDaemon: () => daemon,
  getUpdateAvailable: () => updateAvailable,
  onQuit: () => {
    electronApp.isQuitting = true;
    app.quit();
  },
  onOpenHolidayModal: () => snapshotBridge.openHolidayModal(),
});

const updateBridge = createUpdateBridge({
  app,
  autoUpdater: autoUpdater as unknown as Parameters<typeof createUpdateBridge>[0]['autoUpdater'],
  isDev,
  log,
  emitAppSnapshotChanged: reason => snapshotBridge.emitAppSnapshotChanged(reason),
  onUpdateAvailable: nextUpdate => {
    updateAvailable = nextUpdate;
  },
  refreshTrayMenu: () => trayBridge.refreshMenu(),
  request: https.request,
  setIntervalFn: setInterval,
});

const autoLaunchAdapter = createAutoLaunchAdapter({
  app,
  fs,
  path,
  platform: process.platform,
  homeDir: process.env.HOME || '',
  execSync,
  processExecPath: process.execPath,
  log,
});

const getAppSnapshot = async (): Promise<AppSnapshot> =>
  createAppSnapshotProvider({
    getSlackStatus: async () => {
      if (!daemon) {
        return {
          emoji: '',
          text: '',
          stateCheckValue: '',
        };
      }

      return daemon.getSlackStatus();
    },
    getSourceStatuses: async () => {
      if (!daemon) {
        return {};
      }

      return daemon.getSourceStatuses();
    },
    getDaemonSnapshot: () => ({
      running: daemon ? daemon.isRunning() : false,
    }),
    getUpdateSnapshot: () => updateAvailable,
    getSetupSnapshot,
  }).getSnapshot();

const applyDaemonLogLevel = (): void => {
  if (daemon && 'setLogLevel' in daemon && typeof daemon.setLogLevel === 'function') {
    daemon.setLogLevel(currentLogLevel);
  }
};

const createDaemonInstance = (slackTokens: string[]): SlackStatusBotDaemon =>
  createDaemon({
    slackTokens,
    configStore,
    onAppStateChanged: statusData => {
      logStatusBridgeInfo('Daemon status change forwarded to renderer', statusData);
      snapshotBridge.emitAppSnapshotChanged('daemon-status');
    },
  });

const restartDaemon = async (slackTokens: string[]): Promise<void> => {
  if (daemon) {
    await daemon.stop();
    daemon = null;
  }

  daemon = createDaemonInstance(slackTokens);
  applyDaemonLogLevel();
  await daemon.start();
  trayBridge.refreshMenu();
  snapshotBridge.emitAppSnapshotChanged('daemon-status');
};

const stopDaemon = async (): Promise<void> => {
  if (!daemon) {
    return;
  }

  try {
    await daemon.stop();
  } finally {
    daemon = null;
  }
};

const getLogDir = (): string => path.join(app.getPath('userData'), 'logs');
const getLogFile = (): string => path.join(getLogDir(), 'app.log');

const getLogs = (lines: number): string => {
  const logFile = getLogFile();
  if (!fs.existsSync(logFile)) {
    return '(No logs yet)';
  }

  const content = fs.readFileSync(logFile, 'utf-8');
  return content.split('\n').slice(-lines).join('\n');
};

const clearLogs = (): void => {
  const logDir = getLogDir();
  const logFile = getLogFile();

  if (fs.existsSync(logFile)) {
    fs.unlinkSync(logFile);
  }

  for (let index = 1; index <= 15; index += 1) {
    const backupFile = path.join(logDir, `app.log.${index}`);
    if (fs.existsSync(backupFile)) {
      fs.unlinkSync(backupFile);
    }
  }
};

const setLogLevel = (level: RendererLogLevel): RendererLogLevel => {
  configStore.updateLogLevel(level);
  refreshConfig();
  applyDaemonLogLevel();
  return currentLogLevel;
};

const saveTokens = async (tokens: string | string[]): Promise<void> => {
  const normalizedTokens = Array.isArray(tokens) ? tokens : [tokens];
  configStore.updateSlackTokens(normalizedTokens);
  refreshConfig();
  await restartDaemon(normalizedTokens);
  snapshotBridge.emitAppSnapshotChanged('setup');
};

const deleteTokens = async (): Promise<void> => {
  configStore.clearSlackTokens();
  refreshConfig();
  await stopDaemon();
  trayBridge.refreshMenu();
  snapshotBridge.emitAppSnapshotChanged('setup');
};

const markFirstRunComplete = async (): Promise<void> => {
  configStore.markFirstRunCompleted();
  refreshConfig();
  log('[FirstRun] First run marked as complete');
  snapshotBridge.emitAppSnapshotChanged('setup');
};

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[Electron] Another instance is already running. Quitting...');
  app.quit();
} else {
  app.on('second-instance', () => {
    log('[App] Second instance attempted - focusing existing window');
    void windowLifecycle.showWindow();
  });

  app.whenReady().then(async () => {
    log('[App] App is ready!');
    log(`[App] Platform: ${process.platform}`);
    log(`[App] __dirname: ${__dirname}`);

    refreshConfig();

    registerMainIpcHandlers(ipcMain, {
      getConfig: () => config,
      refreshConfig,
      updateSourceOrder: sourceOrder => configStore.updateSourceOrder(sourceOrder),
      getSetupSnapshot,
      saveTokens,
      deleteTokens,
      markFirstRunComplete,
      getDaemon: () => daemon,
      emitAppSnapshotChanged: (reason: AppSnapshotRefreshReason) =>
        snapshotBridge.emitAppSnapshotChanged(reason),
      refreshTrayMenu: () => trayBridge.refreshMenu(),
      openHolidayModal: () => snapshotBridge.openHolidayModal(),
      getAppSnapshot,
      getLogs,
      clearLogs,
      setLogLevel,
      getLogLevel: () => currentLogLevel,
      setAutoLaunch: enabled => autoLaunchAdapter.setEnabled(enabled),
      getAutoLaunch: () => autoLaunchAdapter.getStatus(),
      logStatusBridgeInfo,
      logStatusBridgeError,
    });

    windowLifecycle.createWindow();
    trayBridge.createTray();
    updateBridge.setupUpdateListeners();
    updateIntervalId = updateBridge.startScheduledChecks();

    try {
      if (hasConfiguredTokens()) {
        await restartDaemon(config.slackTokens || []);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      console.error('[Daemon] Failed to initialize daemon:', message);
      if (stack) {
        console.error('[Daemon] Stack:', stack);
      }
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (!windowLifecycle.getWindow()) {
      windowLifecycle.createWindow();
      return;
    }

    void windowLifecycle.showWindow();
  });

  app.on('before-quit', async () => {
    electronApp.isQuitting = true;

    if (updateIntervalId) {
      clearInterval(updateIntervalId);
      updateIntervalId = null;
    }

    try {
      await stopDaemon();
    } catch (error) {
      console.error('Error stopping daemon:', error);
    }
  });
}
