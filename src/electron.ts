import { runConnectionScenario } from './main/connectionScenario';
import { runDiagnosticScenario } from './main/diagnosticScenario';
import { app, BrowserWindow, Notification, dialog, ipcMain, Menu, Tray, nativeImage, powerMonitor, safeStorage, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import { execSync } from 'child_process';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { createAppConfigStore } from './config/appConfigStore';
import { parseSetupLink } from './contracts/setupLink';
import type { SourceName } from './config/sourceCatalog';
import { createDaemon, type SlackStatusBotDaemon } from './daemon';
import { type AppSnapshot, type AppSnapshotRefreshReason, type AppUpdateSnapshot } from './contracts/appSnapshot';
import type { RendererLogLevel } from './contracts/ipc';
import { createAppSnapshotProvider } from './main/appSnapshotProvider';
import { createAutoLaunchAdapter } from './main/autoLaunchAdapter';
import {
  EXTERNAL_STATUS_PROTOCOL,
  createExternalStatusCommandHandler,
} from './main/externalStatusCommand';
import { registerMainIpcHandlers, registerTelemetryIpcHandlers } from './main/ipcHandlers';
import { createHostTelemetry, resolveTelemetryConfiguration, type HostTelemetry } from './main/telemetry';
import { createMainLogger } from './main/logging';
import { showMacosNotification } from './main/macosNotification';
import { exchangeSlackCode, NativeSlackOAuth } from './main/nativeSlackOAuth';
import { createSnapshotBridge } from './main/snapshotBridge';
import { createTrayBridge } from './main/trayBridge';
import { createUpdateBridge } from './main/updateBridge';
import { createWindowLifecycle } from './main/windowLifecycle';
import { telemetryEvents } from './main/telemetryEvents';
import { WorkspaceConnections, verifySlackToken } from './main/workspaceConnections';

const startupStarted = Date.now();
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
  onConfigRecovery: ({ configPath, backupPath }) => {
    const preservedFile = backupPath
      ? `The unreadable file was preserved at:\n\n${backupPath}`
      : `The unreadable file remains at:\n\n${configPath}`;
    dialog.showErrorBox(
      'Slack Status Bot could not load its settings',
      `${preservedFile}\n\nNo settings were overwritten. Enter your Slack token again to create a new configuration.`
    );
  },
});
const electronApp = app as typeof app & { isQuitting?: boolean };

let daemon: SlackStatusBotDaemon | null = null;
let telemetry: HostTelemetry | null = null;
let daemonReady = false;
let daemonStarted = false;
// Monitor observes fatal Node failures without replacing Node's default crash behavior.
process.on('uncaughtExceptionMonitor', error => telemetry?.reportDiagnostic(error,
  { component: 'runtime', step: 'main.uncaught', fatal: true }));
const runtimeState = () => daemonReady ? 'ready' as const : hasConfiguredTokens() ? 'failed' as const : 'unconfigured' as const;
const onResume = () => {
  telemetry?.capture('runtime_state', { reason: 'resume', state: runtimeState() });
  renewWorkspaceConnections();
};
app.on('child-process-gone', (_event, details) => {
  const reason = telemetryEvents.process_health.shape.reason.safeParse(details.reason);
  telemetry?.capture('process_health', { process_type: 'child', outcome: 'gone', reason: reason.success ? reason.data : 'unknown', exit_code: details.exitCode });
  if (details.reason !== 'clean-exit') telemetry?.reportDiagnostic(new Error(`App child process gone: ${reason.success ? reason.data : 'unknown'}`),
    { component: 'runtime', step: 'child.gone', fatal: true });
});
process.setSourceMapsEnabled(true);
let shutdownStarted = false;
let shutdownComplete = false;
let config: RuntimeConfig = {};
let currentLogLevel: RendererLogLevel = 'ERROR';
let updateAvailable: AppUpdateSnapshot | null = null;
let updateIntervalId: NodeJS.Timeout | null = null;
let migrationRetryTimer: NodeJS.Timeout | null = null;
let renewalTimer: NodeJS.Timeout | null = null;
let externalStatusLaunchRequested = false;
let workspaceConnections: WorkspaceConnections | null = null;
let workspaceConnectionError: string | null = null;
let oauthMessage: string | null = null;
let slackOAuth: NativeSlackOAuth | null = null;
const pendingOAuthUrls: string[] = [];
let appStartupComplete = false;

const renewWorkspaceConnections = (): void => {
  void slackOAuth?.renewDue().catch(() => log('[Connections] Renewal cycle unavailable'));
};

const externalStatusCommandHandler = createExternalStatusCommandHandler({
  getDaemon: () => daemon,
  log,
  notify: notification => {
    if (process.platform === 'darwin') {
      // Electron 42+ requires a signed app bundle for macOS notifications; osascript keeps unsigned builds working.
      showMacosNotification(notification, log);
      return;
    }

    if (Notification.isSupported()) {
      new Notification(notification).show();
    }
  },
});

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
  if (workspaceConnections) {
    try {
      config.slackTokens = workspaceConnections.activeTokens();
      workspaceConnectionError = null;
    } catch (error) {
      config.slackTokens = [];
      workspaceConnectionError = error instanceof Error ? error.message : String(error);
    }
  }
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
  getTelemetry: () => telemetry,
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
  onUpdateLinkOpened: version => telemetry?.capture('update_interaction', { action: 'link_opened', entry_point: 'tray', target_version: version }),
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
  getTelemetry: () => telemetry,
  app,
  autoUpdater: autoUpdater as unknown as Parameters<typeof createUpdateBridge>[0]['autoUpdater'],
  isDev,
  log,
  emitAppSnapshotChanged: reason => snapshotBridge.emitAppSnapshotChanged(reason),
  onUpdateAvailable: nextUpdate => {
    updateAvailable = nextUpdate;
  },
  refreshTrayMenu: () => trayBridge.refreshMenu(),
  notifyUpdateAvailable: nextUpdate => {
    const epoch = telemetry?.getCaptureEpoch();
    const observe = (action: 'notification_requested' | 'notification_shown' | 'notification_failed' | 'notification_unsupported') => {
      if (epoch != null && epoch === telemetry?.getCaptureEpoch()) telemetry.capture('update_interaction',
        { action, entry_point: 'notification', target_version: nextUpdate.version });
    };
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: 'Slack Status Bot update available', body: `Version ${nextUpdate.version} is available`, timeoutType: 'never',
      });
      notification.on('show', () => observe('notification_shown'));
      notification.on('failed', (_event, error) => {
        observe('notification_failed');
        if (epoch != null && epoch === telemetry?.getCaptureEpoch()) telemetry.reportDiagnostic(new Error(error),
          { component: 'update', step: 'notification.show' });
      });
      observe('notification_requested');
      notification.show();
    } else observe('notification_unsupported');
  },
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
    getAppMetadataSnapshot: () => ({
      version: app.getVersion(),
    }),
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
    getWorkspaceStatuses: async () => {
      const observed = daemon ? await daemon.getWorkspaceStatuses() : [];
      const unavailable = workspaceConnections?.list()
        .filter(connection => !observed.some(workspace => workspace.teamId === connection.teamId && workspace.teamId !== null))
        .map(connection => ({
          teamId: connection.teamId,
          teamName: connection.teamName,
          userName: connection.userName,
          health: 'unavailable' as const,
          profile: null,
          delivery: {},
        })) || [];
      return [...observed, ...unavailable];
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

const registerAppProtocol = (): void => {
  const processWithDefaultApp = process as NodeJS.Process & { defaultApp?: boolean };
  const registered = processWithDefaultApp.defaultApp && process.argv.length >= 2
    ? app.setAsDefaultProtocolClient(
        EXTERNAL_STATUS_PROTOCOL,
        process.execPath,
        [path.resolve(process.argv[1])]
      )
    : app.setAsDefaultProtocolClient(EXTERNAL_STATUS_PROTOCOL);

  log(`[App] Protocol registration result: ${registered}`);
};

const handleAppUrl = (rawUrl: string): boolean => {
  if (externalStatusCommandHandler.handleUrl(rawUrl)) {
    externalStatusLaunchRequested = true;
    return true;
  }
  let url: URL;
  try { url = new URL(rawUrl); } catch { return false; }
  if (url.protocol !== `${EXTERNAL_STATUS_PROTOCOL}:` || !['connect', 'oauth'].includes(url.hostname)) return false;
  if (appStartupComplete && slackOAuth) void slackOAuth.handleUrl(rawUrl);
  else pendingOAuthUrls.push(rawUrl);
  if (appStartupComplete) {
    if (windowLifecycle.getWindow()) void windowLifecycle.showWindow();
    else windowLifecycle.createWindow();
  }
  return true;
};

const handleAppUrlFromArgv = (argv: string[]): boolean => {
  const url = argv.find(arg => arg.startsWith(`${EXTERNAL_STATUS_PROTOCOL}://`));
  return url ? handleAppUrl(url) : false;
};

const createDaemonInstance = (slackTokens: string[]): SlackStatusBotDaemon => {
  const activeConnections = workspaceConnections?.activeWorkspaceConnections() || [];
  return createDaemon({
    slackTokens,
    telemetry: telemetry ?? undefined,
    workspaceConnections: slackTokens.map(token => {
      const connection = activeConnections.find(active => active.token === token);
      return {
        teamId: connection?.teamId || null,
        teamName: connection?.teamName || null,
        userName: connection?.userName || null,
      };
    }),
    configStore,
    onAppStateChanged: statusData => {
      logStatusBridgeInfo('Daemon status change forwarded to renderer', statusData);
      snapshotBridge.emitAppSnapshotChanged('daemon-status');
    },
    onWorkspaceDeliveryChanged: () => snapshotBridge.emitAppSnapshotChanged('daemon-status'),
  });
};

const restartDaemon = async (slackTokens: string[]): Promise<void> => {
  const started = Date.now();
  const epoch = telemetry?.getCaptureEpoch();
  daemonReady = false;
  try {
    if (daemon) {
      const activeConnections = workspaceConnections?.activeWorkspaceConnections() || [];
      await daemon.updateConnections(slackTokens, slackTokens.map(token => {
        const connection = activeConnections.find(active => active.token === token);
        return {
          teamId: connection?.teamId || null,
          teamName: connection?.teamName || null,
          userName: connection?.userName || null,
        };
      }));
    } else {
      daemon = createDaemonInstance(slackTokens);
      applyDaemonLogLevel();
      await daemon.start();
      daemonStarted = true;
    }
    await externalStatusCommandHandler.flushPending();
    trayBridge.refreshMenu();
    snapshotBridge.emitAppSnapshotChanged('daemon-status');
    daemonReady = daemonStarted;
    if (epoch != null && epoch === telemetry?.getCaptureEpoch()) {
      telemetry.capture('runtime_state', { reason: 'daemon_started', state: daemonReady ? 'ready' : 'failed', duration_ms: Date.now() - started });
      if (daemonReady) telemetry.recoverDiagnostic({ component: 'runtime', step: 'daemon.start' });
    }
  } catch (error) {
    if (epoch != null && epoch === telemetry?.getCaptureEpoch()) {
      telemetry.capture('runtime_state', { reason: 'daemon_started', state: 'failed', duration_ms: Date.now() - started });
      telemetry.reportDiagnostic(error, { component: 'runtime', step: 'daemon.start' }, slackTokens);
    }
    throw error;
  }
};

const stopDaemon = async (): Promise<void> => {
  if (!daemon) {
    return;
  }

  try {
    await daemon.stop();
  } finally {
    daemon = null;
    daemonReady = false;
    daemonStarted = false;
    telemetry?.capture('runtime_state', { reason: 'daemon_stopped', state: 'stopped' });
  }
};

const retryPendingConnections = (): void => {
  if (!workspaceConnections?.hasPendingVerification() || migrationRetryTimer) return;
  migrationRetryTimer = setTimeout(async () => {
    migrationRetryTimer = null;
    if (!workspaceConnections) return;
    const previousTokens = config.slackTokens || [];
    try {
      await workspaceConnections.migrate();
      refreshConfig();
      const nextTokens = config.slackTokens || [];
      if (JSON.stringify(previousTokens) !== JSON.stringify(nextTokens)) {
        if (nextTokens.length > 0) await restartDaemon(nextTokens);
        else await stopDaemon();
      }
      snapshotBridge.emitAppSnapshotChanged('setup');
    } catch (error) {
      workspaceConnectionError = error instanceof Error ? error.message : String(error);
      log(`[Connections] Verification retry unavailable: ${workspaceConnectionError}`);
    }
    retryPendingConnections();
  }, 60_000);
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
  if (!workspaceConnections) {
    throw new Error(workspaceConnectionError || 'Secure workspace storage is unavailable');
  }
  await workspaceConnections.addTokens(normalizedTokens);
  refreshConfig();
  if (config.slackTokens?.length) await restartDaemon(config.slackTokens);
  else await stopDaemon();
  retryPendingConnections();
  snapshotBridge.emitAppSnapshotChanged('setup');
};

const deleteTokens = async (): Promise<void> => {
  if (workspaceConnections) {
    workspaceConnections.clearAll();
  } else {
    configStore.clearSlackTokens();
  }
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
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleAppUrl(url);
  });

  app.on('second-instance', (_event, argv) => {
    if (handleAppUrlFromArgv(argv)) return;

    log('[App] Second instance attempted - focusing existing window');
    void windowLifecycle.showWindow();
  });

  app.whenReady().then(async () => {
    log('[App] App is ready!');
    log(`[App] Platform: ${process.platform}`);
    log(`[App] __dirname: ${__dirname}`);

    refreshConfig();
    try {
      const bundledPath = path.join(__dirname, 'telemetry-config.json');
      const bundled: unknown = fs.existsSync(bundledPath)
        ? JSON.parse(fs.readFileSync(bundledPath, 'utf8')) : {};
      let autostartEnabled: boolean | undefined;
      try { autostartEnabled = (await autoLaunchAdapter.getStatus()).enabled; } catch { /* Context is optional if OS settings are unavailable. */ }
      telemetry = createHostTelemetry({
        configStore,
        configuration: resolveTelemetryConfiguration(bundled, process.env),
        appVersion: app.getVersion(),
        autostartEnabled,
        systemVersion: process.getSystemVersion(),
        runtimeContext: () => ({ daemon_ready: daemonReady, connected_workspaces: workspaceConnections?.list().filter(connection => connection.state === 'connected').length ?? 0,
          configured_workspaces: workspaceConnections?.list().length ?? config.slackTokens?.length ?? 0 }),
        readResourceUsage: () => {
          const metrics = app.getAppMetrics();
          return { cpu_percent: metrics.reduce((sum, metric) => sum + metric.cpu.percentCPUUsage, 0),
            memory_mb: metrics.reduce((sum, metric) => sum + metric.memory.workingSetSize, 0) / 1024 };
        },
        warn: message => log(message),
      });
      telemetry.start();
      if (process.env.SLACK_STATUS_BOT_POSTHOG_DIAGNOSTIC_TEST === '1') {
        const resultPath = process.env.SLACK_STATUS_BOT_DIAGNOSTIC_RESULT;
        if (!resultPath) throw new Error('Synthetic diagnostic result path missing');
        void runDiagnosticScenario(telemetry, configStore).then(result => {
          fs.writeFileSync(resultPath, JSON.stringify(result));
        }).catch(() => {
          fs.writeFileSync(resultPath, JSON.stringify({ error: 'Synthetic diagnostics failed' }));
        });
      }
      if (process.env.SLACK_STATUS_BOT_POSTHOG_CONNECTION_TEST === '1') {
        const resultPath = process.env.SLACK_STATUS_BOT_CONNECTION_RESULT;
        if (!resultPath) throw new Error('Synthetic connection result path missing');
        void runConnectionScenario(telemetry, configStore).then(result => {
          fs.writeFileSync(resultPath, JSON.stringify(result));
        }).catch(() => {
          fs.writeFileSync(resultPath, JSON.stringify({ error: 'Synthetic connections failed' }));
        });
      }
      registerTelemetryIpcHandlers(ipcMain, telemetry);
    } catch {
      log('[Telemetry] Collection unavailable; app startup continues.');
    }
    try {
      const connections = new WorkspaceConnections({
        directory: app.getPath('userData'),
        config: configStore,
        encryption: safeStorage,
        verify: verifySlackToken,
        telemetry: telemetry ?? undefined,
      });
      await connections.migrate();
      workspaceConnections = connections;
      slackOAuth = new NativeSlackOAuth({
        connections,
        telemetry: telemetry ?? undefined,
        openExternal: url => shell.openExternal(url).then(() => undefined),
        exchange: exchangeSlackCode,
        verify: verifySlackToken,
        onConnected: async () => {
          refreshConfig();
          if (appStartupComplete) {
            if (config.slackTokens?.length) await restartDaemon(config.slackTokens);
            else await stopDaemon();
          }
          snapshotBridge.emitAppSnapshotChanged('setup');
        },
        onReconnectRequired: teamId => {
          const name = connections.list().find(connection => connection.teamId === teamId)?.teamName || teamId;
          const notification = { title: 'Slack connection needs attention',
            body: `Reconnect ${name} in Slack Status Bot settings` };
          if (process.platform === 'darwin') showMacosNotification(notification, log);
          else if (Notification.isSupported()) new Notification(notification).show();
        },
        onRenewalOutcome: (teamId, outcome) => log(`[Connections] ${teamId}: ${outcome}`),
        onResult: message => {
          oauthMessage = message;
          snapshotBridge.emitAppSnapshotChanged('setup');
        },
      });
      try {
        await slackOAuth.renewDue();
      } catch {
        log('[Connections] Startup renewal unavailable');
      }
      refreshConfig();
      retryPendingConnections();
    } catch (error) {
      workspaceConnectionError = error instanceof Error ? error.message : String(error);
      log(`[Connections] Migration unavailable: ${workspaceConnectionError}`);
      dialog.showErrorBox('Slack connections need attention', workspaceConnectionError);
    }
    registerAppProtocol();
    handleAppUrlFromArgv(process.argv);

    registerMainIpcHandlers(ipcMain, {
      getConfig: () => config,
      getWorkspaceConnections: () => workspaceConnections?.list() || [],
      getWorkspaceConnectionError: () => workspaceConnectionError,
      getOAuthMessage: () => oauthMessage,
      openSetupLink: async link => {
        if (!slackOAuth || !parseSetupLink(link)) {
          telemetry?.capture('setup_input', { outcome: 'rejected', reason: 'invalid_link', entry_point: 'app' });
          throw new Error('Invalid Setup Link');
        }
        await slackOAuth.handleUrl(link);
      },
      reconnectWorkspace: async teamId => {
        if (!slackOAuth) throw new Error('Slack connections are unavailable');
        await slackOAuth.reconnect(teamId);
      },
      removeWorkspace: async teamId => {
        if (!slackOAuth || !slackOAuth.removeWorkspace(teamId)) throw new Error('Workspace connection not found');
        refreshConfig();
        if (config.slackTokens?.length) await restartDaemon(config.slackTokens);
        else await stopDaemon();
        trayBridge.refreshMenu();
        snapshotBridge.emitAppSnapshotChanged('setup');
      },
      refreshConfig,
      updateMeetingDnd: enabled => configStore.updateDaemonSettings({ meetingDnd: enabled }),
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
      telemetry: telemetry ?? undefined,
      setAutoLaunch: enabled => autoLaunchAdapter.setEnabled(enabled),
      getAutoLaunch: () => autoLaunchAdapter.getStatus(),
      logStatusBridgeInfo,
      logStatusBridgeError,
    });

    windowLifecycle.createWindow({ showOnReady: !externalStatusLaunchRequested });
    trayBridge.createTray();
    updateBridge.setupUpdateListeners();
    updateIntervalId = updateBridge.startScheduledChecks();
    renewalTimer = setInterval(renewWorkspaceConnections, 60_000);
    powerMonitor.on('resume', onResume);

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
    telemetry?.capture('runtime_state', { reason: 'startup', state: runtimeState(), duration_ms: Date.now() - startupStarted });
    appStartupComplete = true;
    for (const url of pendingOAuthUrls.splice(0)) await slackOAuth?.handleUrl(url);
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

  app.on('before-quit', async event => {
    if (shutdownComplete) return;
    event.preventDefault();
    if (shutdownStarted) return;
    shutdownStarted = true;
    if (migrationRetryTimer) clearTimeout(migrationRetryTimer);
    if (renewalTimer) clearInterval(renewalTimer);
    powerMonitor.removeListener('resume', onResume);
    electronApp.isQuitting = true;

    if (updateIntervalId) {
      clearInterval(updateIntervalId);
      updateIntervalId = null;
    }

    // Stop new automation immediately while telemetry gets its bounded best-effort flush.
    void stopDaemon().catch(error => {
      console.error('Error stopping daemon:', error);
    });
    telemetry?.capture('runtime_state', { reason: 'shutdown', state: 'stopped' });
    await telemetry?.shutdown();
    shutdownComplete = true;
    app.quit();
  });
}
