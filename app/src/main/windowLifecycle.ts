interface WindowLifecycleDependencies {
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
    send: (channel: string, payload?: unknown) => void;
    openDevTools: () => void;
    setWindowOpenHandler: (handler: ({ url }: { url: string }) => { action: 'deny' }) => void;
  };
}

export interface WindowLifecycle {
  createWindow: () => BrowserWindowInstance;
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

  function createWindow(): BrowserWindowInstance {
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
      },
      show: false,
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

    mainWindow.once('ready-to-show', () => {
      void showWindow();
    });

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
