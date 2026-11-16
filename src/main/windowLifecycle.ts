import type { HostTelemetry } from './telemetry';
import { telemetryEvents } from './telemetryEvents';
import { z } from 'zod';

interface WindowLifecycleDependencies {
  getTelemetry?: () => HostTelemetry | null;
  app: {
    dock?: {
      show: () => Promise<void>;
      hide: () => void;
    };
    isQuitting?: boolean;
  };
  BrowserWindow: new (options: BrowserWindowOptions) => BrowserWindowInstance;
  shell: {
    openExternal: (url: string) => void;
  };
  isDev: boolean;
  preloadPath: string;
  getStartUrl: () => string;
  hasTray: () => boolean;
  onClosed: () => void;
}

interface BrowserWindowOptions {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  webPreferences: {
    preload: string;
    nodeIntegration: boolean;
    contextIsolation: boolean;
    sandbox: boolean;
    enableRemoteModule: boolean;
  };
  show: boolean;
}

interface BrowserWindowInstance {
  show: () => void;
  focus: () => void;
  hide: () => void;
  loadURL: (url: string) => void;
  on: (event: string, callback: (...args: unknown[]) => unknown) => unknown;
  once: (event: string, callback: () => unknown) => unknown;
  webContents: {
    on?: (event: string, callback: (...args: unknown[]) => void) => unknown;
    send: (channel: string, payload?: unknown) => void;
    openDevTools: () => void;
    setWindowOpenHandler: (handler: ({ url }: { url: string }) => { action: 'deny' }) => void;
  };
}

export interface WindowLifecycle {
  createWindow: (options?: { showOnReady?: boolean }) => BrowserWindowInstance;
  getWindow: () => BrowserWindowInstance | null;
  showWindow: () => Promise<void>;
  send: (channel: string, payload?: unknown) => void;
}

export function createWindowLifecycle({
  app,
  BrowserWindow,
  shell,
  isDev,
  preloadPath,
  getStartUrl,
  hasTray,
  onClosed,
  getTelemetry,
}: WindowLifecycleDependencies): WindowLifecycle {
  let mainWindow: BrowserWindowInstance | null = null;

  async function showWindow(): Promise<void> {
    if (!mainWindow) {
      return;
    }

    if (process.platform === 'darwin') {
      await app.dock?.show?.();
    }

    mainWindow.show();
    mainWindow.focus();
  }

  function createWindow(options: { showOnReady?: boolean } = {}): BrowserWindowInstance {
    const showOnReady = options.showOnReady ?? true;

    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        enableRemoteModule: false,
      },
      show: false,
    });

    mainWindow.webContents.on?.('did-fail-load', (_event, errorCode, description, _url, isMainFrame) => {
      if (isMainFrame === false || errorCode === -3) return; // Cancelled navigations are expected.
      getTelemetry?.()?.capture('process_health', { process_type: 'renderer', outcome: 'load_failed', exit_code: typeof errorCode === 'number' ? errorCode : undefined });
      const code = z.string().regex(/^ERR_[A-Z_]+$/).safeParse(description);
      getTelemetry?.()?.reportDiagnostic(new Error(code.success ? `Renderer page failed to load: ${code.data}` : 'Renderer page failed to load'),
        { component: 'renderer', step: 'window.load', code: code.success ? code.data : undefined });
    });
    mainWindow.webContents.on?.('did-finish-load', () => getTelemetry?.()?.recoverDiagnostic({ component: 'renderer', step: 'window.load' }));
    mainWindow.webContents.on?.('render-process-gone', (_event, details) => {
      const parsed = z.object({ reason: telemetryEvents.process_health.shape.reason, exitCode: z.number().int().optional() }).safeParse(details);
      const reason = parsed.success ? parsed.data.reason ?? 'unknown' : 'unknown';
      getTelemetry?.()?.capture('process_health', { process_type: 'renderer', outcome: 'gone', reason, exit_code: parsed.success ? parsed.data.exitCode : undefined });
      if (reason !== 'clean-exit') getTelemetry?.()?.reportDiagnostic(new Error(`Renderer process gone: ${reason}`),
        { component: 'renderer', step: 'process.gone', fatal: true });
    });
    mainWindow.on('unresponsive', () => {
      getTelemetry?.()?.capture('process_health', { process_type: 'renderer', outcome: 'unresponsive' });
      getTelemetry?.()?.reportDiagnostic(new Error('Renderer is unresponsive'), { component: 'renderer', step: 'window.responsiveness' });
    });
    mainWindow.on('responsive', () => {
      getTelemetry?.()?.capture('process_health', { process_type: 'renderer', outcome: 'responsive' });
      getTelemetry?.()?.recoverDiagnostic({ component: 'renderer', step: 'window.responsiveness' });
    });
    mainWindow.loadURL(getStartUrl());

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        shell.openExternal(url);
      }

      return { action: 'deny' };
    });

    if (isDev) {
      mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
      mainWindow = null;
      onClosed();
    });

    mainWindow.on('minimize', event => {
      (event as { preventDefault?: () => void }).preventDefault?.();
      if (hasTray()) {
        mainWindow?.hide();
      }
    });

    mainWindow.on('close', event => {
      if (!app.isQuitting) {
        (event as { preventDefault?: () => void }).preventDefault?.();
        mainWindow?.hide();
      }
    });

    if (showOnReady) {
      mainWindow.once('ready-to-show', () => {
        void showWindow();
      });
    }

    mainWindow.on('hide', () => {
      if (process.platform === 'darwin') {
        app.dock?.hide?.();
      }
    });

    return mainWindow;
  }

  function send(channel: string, payload?: unknown): void {
    if (mainWindow?.webContents) {
      mainWindow.webContents.send(channel, payload);
    }
  }

  return {
    createWindow,
    getWindow: () => mainWindow,
    showWindow,
    send,
  };
}
