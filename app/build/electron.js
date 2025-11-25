console.log('[Electron] Starting up...');

const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

console.log('[Electron] Modules loaded');

// Check if running in development
const isDev = process.env.NODE_ENV === 'development';
console.log('[Electron] isDev:', isDev);

// Note: In production, the daemon would be built separately
// For now, we'll import from dist if available
let daemon;
let createDaemon;

let mainWindow;
let tray;

// Simple config storage in user app data
const getConfigPath = () => {
  const appData = app.getPath('userData');
  return path.join(appData, 'config.json');
};

const loadConfig = () => {
  try {
    const configPath = getConfigPath();
    console.log('[Config] Loading config from:', configPath);
    console.log('[Config] File exists:', fs.existsSync(configPath));
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      console.log('[Config] File content:', content);
      const config = JSON.parse(content);
      console.log('[Config] Parsed config:', JSON.stringify(config, null, 2));
      console.log('[Config] Loaded config:', { hasTokens: !!config.slackTokens, tokenCount: config.slackTokens?.length });
      return config;
    }
    console.log('[Config] Config file does not exist');
  } catch (e) {
    console.error('Error loading config:', e);
  }
  return {};
};

const saveConfig = (config) => {
  try {
    const configPath = getConfigPath();
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    console.log('[Config] Saving config to:', configPath, { hasTokens: !!config.slackTokens });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log('[Config] Config saved successfully');
  } catch (e) {
    console.error('Error saving config:', e);
  }
};

let config = {}; // Will be loaded in app.whenReady()

// Note: Squirrel startup handler not needed for modern electron-builder

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
    },
    show: false,
  });

  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../build/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('minimize', (event) => {
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

function createTray() {
  const trayIconPath = path.join(__dirname, '../assets/icon.png');
  
  // Skip tray creation if icon doesn't exist
  if (!fs.existsSync(trayIconPath)) {
    console.warn('[Tray] Icon not found at:', trayIconPath, '- skipping tray');
    return;
  }

  try {
    tray = new Tray(trayIconPath);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      {
        label: 'Go Online',
        click: () => {
          ipcMain.emit('daemon-go-online');
        },
      },
      {
        label: 'Go Away',
        click: () => {
          ipcMain.emit('daemon-go-away');
        },
      },
      {
        type: 'separator',
      },
      {
        label: 'Quit',
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
      if (mainWindow) {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
      }
    });
    
    console.log('[Tray] Tray icon created successfully');
  } catch (e) {
    console.warn('[Tray] Failed to create tray:', e.message);
  }
}

app.whenReady().then(() => {
  console.log('[App] App is ready!');
  
  // Load config now that app is ready
  config = loadConfig();
  console.log('[App] Config loaded:', { hasTokens: !!config.slackTokens });
  
  createWindow();
  createTray();

  // Initialize daemon if available
  try {
    let daemonPath;
    
    if (isDev) {
      // Dev: regular dist folder
      daemonPath = path.resolve(__dirname, '../dist/daemon');
    } else {
      // Production: asar is disabled, dist is at /Applications/App.app/Contents/Resources/app/dist
      // __dirname is /Applications/App.app/Contents/Resources/app/build
      const appPath = path.resolve(__dirname, '..');
      daemonPath = path.join(appPath, 'dist', 'daemon');
    }
    
    console.log('[Daemon] Loading daemon from:', daemonPath);
    
    const daemonModule = require(daemonPath);
    console.log('[Daemon] Loaded daemon module:', Object.keys(daemonModule));
    createDaemon = daemonModule.createDaemon;
    console.log('[Daemon] createDaemon function available:', typeof createDaemon);
    
    if (config.slackTokens && Array.isArray(config.slackTokens) && config.slackTokens.length > 0) {
      console.log('[Daemon] Starting daemon with stored tokens:', config.slackTokens.length);
      daemon = createDaemon({ 
        slackTokens: config.slackTokens,
        onStatusChanged: (statusData) => {
          console.log('[Daemon] Status changed, sending to UI:', statusData);
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('status-changed', statusData);
          }
        }
      });
      daemon.start().catch(err => console.error('Error starting daemon:', err));
    } else {
      console.log('[Daemon] No tokens configured, daemon will start after tokens are saved');
    }
  } catch (e) {
    console.error('[Daemon] Failed to initialize daemon:', e.message);
    console.error('[Daemon] Stack:', e.stack);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

app.on('before-quit', async () => {
  app.isQuitting = true;
  if (daemon) {
    try {
      await daemon.stop();
    } catch (e) {
      console.error('Error stopping daemon:', e);
    }
  }
});

// ============== IPC Handlers ==============

/**
 * Get stored Slack tokens (for display in UI)
 */
ipcMain.handle('get-tokens', async (event) => {
  try {
    console.log('[IPC] get-tokens called');
    const tokens = config.slackTokens || [];
    // Return masked tokens for security - show only first and last 4 chars
    const maskedTokens = Array.isArray(tokens)
      ? tokens.map(t => {
          if (t.length > 8) {
            return `${t.substring(0, 4)}...${t.substring(t.length - 4)}`;
          }
          return '****';
        })
      : [];
    return { success: true, tokens: maskedTokens, count: tokens.length };
  } catch (error) {
    console.error('Error getting tokens:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Save Slack tokens
 */
ipcMain.handle('save-tokens', async (event, tokens) => {
  try {
    console.log('[IPC] save-tokens called with tokens:', Array.isArray(tokens) ? `${tokens.length} token(s)` : '1 token');
    config.slackTokens = tokens;
    console.log('[IPC] Updated config.slackTokens');
    saveConfig(config);
    console.log('[IPC] Config saved to disk');
    
    // Restart daemon with new tokens
    if (daemon) {
      await daemon.stop();
    }
    
    if (createDaemon) {
      daemon = createDaemon({ 
        slackTokens: tokens,
        onStatusChanged: (statusData) => {
          console.log('[Daemon] Status changed, sending to UI:', statusData);
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.send('status-changed', statusData);
          }
        }
      });
      await daemon.start();
      console.log('[IPC] Daemon started with new tokens');
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error saving tokens:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Delete all Slack tokens
 */
ipcMain.handle('delete-tokens', async (event) => {
  try {
    console.log('[IPC] delete-tokens called');
    config.slackTokens = [];
    saveConfig(config);
    console.log('[IPC] Tokens deleted');
    
    // Stop daemon if running
    if (daemon) {
      await daemon.stop();
      daemon = null;
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error deleting tokens:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Get current Slack status
 */
ipcMain.handle('get-slack-status', async (event) => {
  try {
    if (!daemon) {
      return { success: false, error: 'Daemon not initialized' };
    }
    const status = await daemon.getSlackStatus();
    return { success: true, data: status };
  } catch (error) {
    console.error('Error getting status:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Get source statuses
 */
ipcMain.handle('get-source-statuses', async (event) => {
  try {
    if (!daemon) {
      return { success: false, error: 'Daemon not initialized' };
    }
    const statuses = await daemon.getSourceStatuses();
    return { success: true, data: statuses };
  } catch (error) {
    console.error('Error getting source statuses:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Set custom status
 */
ipcMain.handle('set-status', async (event, emoji, message) => {
  try {
    if (!daemon) {
      return { success: false, error: 'Daemon not initialized' };
    }
    const success = await daemon.setStatus(emoji, message);
    return { success, data: success };
  } catch (error) {
    console.error('Error setting status:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Go online
 */
ipcMain.handle('go-online', async (event) => {
  try {
    if (!daemon) {
      return { success: false, error: 'Daemon not initialized' };
    }
    const success = await daemon.goOnline();
    return { success, data: success };
  } catch (error) {
    console.error('Error going online:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Go away
 */
ipcMain.handle('go-away', async (event) => {
  try {
    if (!daemon) {
      return { success: false, error: 'Daemon not initialized' };
    }
    const success = await daemon.goAway();
    return { success, data: success };
  } catch (error) {
    console.error('Error going away:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Toggle source
 */
ipcMain.handle('toggle-source', async (event, source, enabled) => {
  try {
    if (!daemon) {
      return { success: false, error: 'Daemon not initialized' };
    }
    daemon.toggleSource(source, enabled);
    return { success: true };
  } catch (error) {
    console.error('Error toggling source:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-source-order', async (event, sourceOrder) => {
  try {
    config.sourceOrder = sourceOrder;
    saveConfig(config);
    console.log('[IPC] Source order updated:', sourceOrder);
    
    // Update daemon's source order in real-time if running
    if (daemon) {
      await daemon.setSourceOrder(sourceOrder);
      console.log('[IPC] Daemon source order updated and re-evaluated in real-time');
    }
    
    return { success: true };
  } catch (error) {
    console.error('Error setting source order:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-source-order', async (event) => {
  try {
    const order = config.sourceOrder || ['spotify', 'appleMusic', 'zoom', 'teams', 'huddle'];
    console.log('[IPC] Source order requested:', order);
    return { success: true, sourceOrder: order };
  } catch (error) {
    console.error('Error getting source order:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Get daemon status
 */
ipcMain.handle('get-daemon-status', async (event) => {
  try {
    if (!daemon) {
      return { success: false, data: { running: false, error: 'Daemon not initialized' } };
    }
    return {
      success: true,
      data: {
        running: daemon.isRunning(),
      },
    };
  } catch (error) {
    console.error('Error getting daemon status:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Get recent logs
 */
ipcMain.handle('get-logs', async (event, lines = 200) => {
  try {
    const { logger } = require('../dist/utils/logger');
    const logs = logger.getRecentLogs(lines);
    return { success: true, data: logs };
  } catch (error) {
    console.error('Error getting logs:', error);
    return { success: false, error: error.message, data: '(Error reading logs)' };
  }
});

ipcMain.handle('clear-logs', async (event) => {
  try {
    const { logger } = require('../dist/utils/logger');
    logger.clearLogs();
    console.log('[IPC] Logs cleared');
    return { success: true };
  } catch (error) {
    console.error('Error clearing logs:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-log-level', async (event, level) => {
  try {
    const { logger } = require('../dist/utils/logger');
    logger.setLogLevel(level);
    return { success: true, logLevel: level };
  } catch (error) {
    console.error('Error setting log level:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-log-level', async (event) => {
  try {
    const { logger } = require('../dist/utils/logger');
    const logLevel = logger.getLogLevel();
    return { success: true, logLevel };
  } catch (error) {
    console.error('Error getting log level:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Set holiday status with return date
 */
ipcMain.handle('set-holiday', async (event, returnDate) => {
  try {
    if (!daemon) {
      return { success: false, error: 'Daemon not initialized' };
    }
    console.log('[IPC] set-holiday called with date:', returnDate);
    const success = await daemon.setHoliday(returnDate);
    return { success, data: success };
  } catch (error) {
    console.error('Error setting holiday:', error);
    return { success: false, error: error.message };
  }
});

