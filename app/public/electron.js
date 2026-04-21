console.log('[Electron] Starting up...');

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const https = require('https');

const { createMainLogger } = require('./main/logging');
const { createWindowLifecycle } = require('./main/windowLifecycle');
const { createSnapshotBridge } = require('./main/snapshotBridge');
const { createTrayBridge } = require('./main/trayBridge');
const { createUpdateBridge } = require('./main/updateBridge');
const { createAutoLaunchAdapter } = require('./main/autoLaunchAdapter');
const { registerMainIpcHandlers } = require('./main/ipcHandlers');

console.log('[Electron] Modules loaded');

const isDev = process.env.NODE_ENV === 'development';
console.log('[Electron] isDev:', isDev);

const { log, logStatusBridgeInfo, logStatusBridgeError } = createMainLogger({
  app,
  fs,
  path,
  console,
});

let daemon;
let createDaemon;
let createAppSnapshotProvider;
let configStore;
let config = {};
let currentLogLevel = 'ERROR';
let updateAvailable = null;
let updateIntervalId = null;

const getDistModulePath = modulePath => {
  if (isDev) {
    return path.resolve(__dirname, '../dist', modulePath);
  }

  return path.join(path.resolve(__dirname, '..'), 'dist', modulePath);
};

const getConfigStore = () => {
  if (!configStore) {
    const configStoreModule = require(getDistModulePath('config/appConfigStore'));
    configStore = configStoreModule.createAppConfigStore({
      configDir: app.getPath('userData'),
    });
  }

  return configStore;
};

const loadConfig = () => {
  try {
    return getConfigStore().load();
  } catch (error) {
    console.error('Error loading config:', error);
    return {};
  }
};

const refreshConfig = () => {
  config = loadConfig();
  currentLogLevel = config.logLevel || 'ERROR';
  return config;
};

const hasConfiguredTokens = () =>
  Array.isArray(config.slackTokens) && config.slackTokens.length > 0;

const getSetupSnapshot = () => ({
  tokensConfigured: hasConfiguredTokens(),
  isFirstRun: !config.hasCompletedFirstRun,
});

const windowLifecycle = createWindowLifecycle({
  app,
  BrowserWindow,
  shell,
  path,
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
  Tray,
  Menu,
  nativeImage,
  shell,
  fs,
  path,
  __dirname,
  log,
  showWindow: () => windowLifecycle.showWindow(),
  getDaemon: () => daemon,
  getUpdateAvailable: () => updateAvailable,
  onQuit: () => {
    app.isQuitting = true;
    app.quit();
  },
  onOpenHolidayModal: () => snapshotBridge.openHolidayModal(),
});

const updateBridge = createUpdateBridge({
  app,
  autoUpdater,
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

const buildAppSnapshotProvider = () => {
  if (typeof createAppSnapshotProvider !== 'function') {
    throw new Error('App snapshot provider is not available');
  }

  return createAppSnapshotProvider({
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
  });
};

const getAppSnapshot = async () => buildAppSnapshotProvider().getSnapshot();

const initializeDaemonModules = () => {
  const daemonModule = require(getDistModulePath('daemon'));
  createDaemon = daemonModule.createDaemon;

  const appSnapshotProviderModule = require(getDistModulePath('main/appSnapshotProvider'));
  createAppSnapshotProvider = appSnapshotProviderModule.createAppSnapshotProvider;
};

const applyDaemonLogLevel = () => {
  if (daemon && daemon.setLogLevel) {
    daemon.setLogLevel(currentLogLevel);
  }
};

const createDaemonInstance = slackTokens =>
  createDaemon({
    slackTokens,
    onAppStateChanged: statusData => {
      logStatusBridgeInfo('Daemon status change forwarded to renderer', statusData);
      snapshotBridge.emitAppSnapshotChanged('daemon-status');
    },
  });

const restartDaemon = async slackTokens => {
  if (daemon) {
    await daemon.stop();
    daemon = null;
  }

  if (!createDaemon) {
    return;
  }

  daemon = createDaemonInstance(slackTokens);
  applyDaemonLogLevel();
  await daemon.start();
  trayBridge.refreshMenu();
};

const stopDaemon = async () => {
  if (!daemon) {
    return;
  }

  try {
    await daemon.stop();
  } finally {
    daemon = null;
  }
};

const getLogDir = () => path.join(app.getPath('userData'), 'logs');
const getLogFile = () => path.join(getLogDir(), 'app.log');

const getLogs = lines => {
  const logFile = getLogFile();
  if (!fs.existsSync(logFile)) {
    return '(No logs yet)';
  }

  const content = fs.readFileSync(logFile, 'utf-8');
  return content.split('\n').slice(-lines).join('\n');
};

const clearLogs = () => {
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

const setLogLevel = level => {
  getConfigStore().updateLogLevel(level);
  refreshConfig();
  applyDaemonLogLevel();
  return currentLogLevel;
};

const saveTokens = async tokens => {
  const normalizedTokens = Array.isArray(tokens) ? tokens : [tokens];
  getConfigStore().updateSlackTokens(normalizedTokens);
  refreshConfig();
  await restartDaemon(normalizedTokens);
  snapshotBridge.emitAppSnapshotChanged('setup');
};

const deleteTokens = async () => {
  getConfigStore().clearSlackTokens();
  refreshConfig();
  await stopDaemon();
  trayBridge.refreshMenu();
  snapshotBridge.emitAppSnapshotChanged('setup');
};

const markFirstRunComplete = async () => {
  getConfigStore().markFirstRunCompleted();
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
    initializeDaemonModules();

    windowLifecycle.createWindow();
    trayBridge.createTray();
    updateBridge.setupUpdateListeners();
    updateIntervalId = updateBridge.startScheduledChecks();

    try {
      if (hasConfiguredTokens()) {
        await restartDaemon(config.slackTokens);
      }
    } catch (error) {
      console.error('[Daemon] Failed to initialize daemon:', error.message);
      console.error('[Daemon] Stack:', error.stack);
    }

    registerMainIpcHandlers(ipcMain, {
      getConfig: () => config,
      refreshConfig,
      updateSourceOrder: sourceOrder => getConfigStore().updateSourceOrder(sourceOrder),
      getSetupSnapshot,
      saveTokens,
      deleteTokens,
      markFirstRunComplete,
      getDaemon: () => daemon,
      emitAppSnapshotChanged: reason => snapshotBridge.emitAppSnapshotChanged(reason),
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
    app.isQuitting = true;

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
