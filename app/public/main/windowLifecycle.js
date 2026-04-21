function createWindowLifecycle({
  app,
  BrowserWindow,
  shell,
  path,
  isDev,
  preloadPath,
  getStartUrl,
  hasTray,
  onClosed,
}) {
  let mainWindow = null;

  async function showWindow() {
    if (!mainWindow) {
      return;
    }

    if (process.platform === 'darwin') {
      await app.dock.show();
    }

    mainWindow.show();
    mainWindow.focus();
  }

  function createWindow() {
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
      if (typeof onClosed === 'function') {
        onClosed();
      }
    });

    mainWindow.on('minimize', event => {
      event.preventDefault();
      if (hasTray()) {
        mainWindow.hide();
      }
    });

    mainWindow.on('close', event => {
      if (!app.isQuitting) {
        event.preventDefault();
        mainWindow.hide();
      }
    });

    mainWindow.once('ready-to-show', () => {
      void showWindow();
    });

    mainWindow.on('hide', () => {
      if (process.platform === 'darwin') {
        app.dock.hide();
      }
    });

    return mainWindow;
  }

  function send(channel, payload) {
    if (mainWindow && mainWindow.webContents) {
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

module.exports = {
  createWindowLifecycle,
};
