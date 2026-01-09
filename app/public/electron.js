console.log('[Electron] Starting up...');

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

// Logging-Funktion für Debugging
const logToFile = (message) => {
  const logPath = path.join(app.getPath('userData'), 'tray-debug.log');
  const timestamp = new Date().toISOString();
  try {
    fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`, 'utf-8');
  } catch (e) {
    // Ignore logging errors
  }
  console.log(message);
};

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
let buildContextMenu; // Wird in createTray() definiert

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
    // Nur verstecken, wenn das Tray erfolgreich erstellt wurde
    if (tray) {
      mainWindow.hide();
    }
    // Sonst: Fenster im Vordergrund lassen, bis Tray funktioniert
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

  // Dock-Verhalten: Verstecken beim Minimieren, Anzeigen beim Öffnen
  mainWindow.on('hide', () => {
    if (process.platform === 'darwin') {
      app.dock.hide();
    }
  });

  mainWindow.on('show', () => {
    if (process.platform === 'darwin') {
      app.dock.show();
    }
  });
}

function updateTrayMenu() {
  if (tray && buildContextMenu) {
    tray.setContextMenu(buildContextMenu());
  }
}

function createTray() {
  logToFile('[Tray] Starting tray creation...');
  logToFile('[Tray] __dirname: ' + __dirname);
  
  // Die Icons können an verschiedenen Orten sein, je nachdem ob Dev oder Build
  // Dev: /app/assets/
  // Build: /app/dist/mac-arm64/.../Resources/app/assets/ oder /Resources/
  
  const trayIconPathPNG = path.join(__dirname, '../assets/tray-icon.png');
  const trayIconPathICNS = path.join(__dirname, '../assets/icon.icns');
  const trayIconPathPNGResources = path.join(__dirname, '../../icon.icns'); // /Resources/icon.icns level
  const trayIconPathAppResources = path.join(app.getAppPath(), 'assets', 'tray-icon.png');
  const trayIconPathAppResourcesICNS = path.join(app.getAppPath(), 'assets', 'icon.icns');
  
  const pathsToTry = [
    trayIconPathPNG,
    trayIconPathICNS,
    trayIconPathAppResources,
    trayIconPathAppResourcesICNS,
    trayIconPathPNGResources,
  ];
  
  logToFile('[Tray] Trying these paths:');
  pathsToTry.forEach(p => logToFile('[Tray]   ' + p + ' exists: ' + fs.existsSync(p)));
  
  let trayIconPath;
  for (const p of pathsToTry) {
    if (fs.existsSync(p)) {
      trayIconPath = p;
      logToFile('[Tray] Found icon at: ' + p);
      break;
    }
  }
  
  if (!trayIconPath) {
    logToFile('[Tray] ERROR: No icon found at any path!');
    return;
  }

  try {
    logToFile('[Tray] Loading icon from: ' + trayIconPath);
    
    // Versuche zuerst direkt mit Pfad
    logToFile('[Tray] Creating Tray with direct path...');
    tray = new Tray(trayIconPath);
    logToFile('[Tray] SUCCESS: Tray created with direct path!');
    
    // Versuche zu skalieren, falls PNG zu groß ist
    if (process.platform === 'darwin') {
      logToFile('[Tray] macOS detected, trying to resize icon...');
      try {
        const iconImage = nativeImage.createFromPath(trayIconPath);
        if (!iconImage.isEmpty()) {
          const resized = iconImage.resize({ width: 22, height: 22 });
          tray.setImage(resized);
          logToFile('[Tray] Icon resized to 22x22');
        }
      } catch (e) {
        logToFile('[Tray] Warning: Could not resize icon: ' + e.message);
      }
    }

    // Funktion zum Erstellen des Context-Menüs
    buildContextMenu = () => {
      const menuItems = [
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
          click: async () => {
            if (daemon) {
              await daemon.goOnline();
            }
          },
        },
        {
          label: 'Go Away',
          click: async () => {
            if (daemon) {
              await daemon.goAway();
            }
          },
        },
      ];

      // Quick Actions Submenu hinzufügen
      if (daemon) {
        try {
          const statusConfig = daemon.getStatusConfiguration();
          const quickActions = statusConfig.filter(s => s.quickActionLabel);
          
          if (quickActions.length > 0) {
            const quickActionItems = quickActions.map(status => ({
              label: status.quickActionLabel || `${status.emoji} ${status.message}`,
              click: async () => {
                if (status.id === 'holiday') {
                  // Holiday-Special: Fenster öffnen und Modal triggern
                  if (mainWindow) {
                    mainWindow.show();
                    mainWindow.focus();
                    // Event an Renderer senden
                    mainWindow.webContents.send('open-holiday-modal');
                  }
                } else {
                  // Normale Quick Action: Status setzen
                  if (daemon) {
                    await daemon.setStatus(status.emoji, status.message);
                  }
                }
              },
            }));

            menuItems.push({
              label: 'Quick Actions',
              submenu: quickActionItems,
            });
          }
        } catch (error) {
          console.error('[Tray] Error building quick actions menu:', error);
        }
      }

      menuItems.push(
        {
          type: 'separator',
        },
        {
          label: 'Quit',
          click: () => {
            app.isQuitting = true;
            app.quit();
          },
        }
      );

      return Menu.buildFromTemplate(menuItems);
    };

    tray.setContextMenu(buildContextMenu());

    // Rechtsklick (oder Ctrl+Klick) zeigt das Menü - kein zusätzlicher Click-Handler nötig
    // Der Benutzer kann "Show" im Menü anklicken, um die App zu öffnen
    
    logToFile('[Tray] Tray icon created successfully');
  } catch (e) {
    logToFile('[Tray] ERROR: Failed to create tray: ' + e.message);
    logToFile('[Tray] Stack: ' + (e.stack || 'no stack'));
  }
}

app.whenReady().then(() => {
  logToFile('[App] App is ready!');
  logToFile('[App] Platform: ' + process.platform);
  logToFile('[App] __dirname: ' + __dirname);
  
  // Load config now that app is ready
  config = loadConfig();
  logToFile('[App] Config loaded');
  
  logToFile('[App] Creating window...');
  createWindow();
  logToFile('[App] Creating tray...');
  createTray();
  logToFile('[App] Tray creation attempted');

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
      // Tray-Menü aktualisieren, nachdem Daemon initialisiert wurde
      updateTrayMenu();
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
      // Tray-Menü aktualisieren, nachdem Daemon gestartet wurde
      updateTrayMenu();
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

/**
 * Get status configuration
 */
ipcMain.handle('get-status-configuration', async (event) => {
  try {
    if (!daemon) {
      return { success: false, error: 'Daemon not initialized' };
    }
    const config = daemon.getStatusConfiguration();
    return { success: true, data: config };
  } catch (error) {
    console.error('Error getting status configuration:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Update status configuration
 */
ipcMain.handle('update-status-configuration', async (event, statusConfig) => {
  try {
    if (!daemon) {
      return { success: false, error: 'Daemon not initialized' };
    }
    const success = await daemon.updateStatusConfiguration(statusConfig);
    if (success && daemon.statusManager?.setCustomStatuses) {
      daemon.statusManager.setCustomStatuses(statusConfig);
    }
    // Tray-Menü aktualisieren, nachdem Status-Konfiguration geändert wurde
    updateTrayMenu();
    return { success };
  } catch (error) {
    console.error('Error updating status configuration:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Reset status configuration to defaults
 */
ipcMain.handle('reset-status-configuration', async (event) => {
  try {
    if (!daemon) {
      return { success: false, error: 'Daemon not initialized' };
    }
    const success = await daemon.resetStatusConfiguration();
    // Tray-Menü aktualisieren, nachdem Status-Konfiguration zurückgesetzt wurde
    updateTrayMenu();
    return { success };
  } catch (error) {
    console.error('Error resetting status configuration:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Open holiday modal (triggers event to renderer)
 */
ipcMain.handle('open-holiday-modal', async (event) => {
  try {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('open-holiday-modal');
      return { success: true };
    }
    return { success: false, error: 'Main window not available' };
  } catch (error) {
    console.error('Error opening holiday modal:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Set auto-launch (App beim Hochfahren starten)
 * Auf macOS erstellen wir einen LaunchAgent statt setLoginItemSettings zu verwenden,
 * da das nicht auf unsigned apps funktioniert
 */
ipcMain.handle('set-auto-launch', async (event, enabled) => {
  try {
    console.log('[AutoLaunch] Setting auto-launch to:', enabled);
    logToFile('[AutoLaunch] Setting auto-launch to: ' + enabled);
    
    if (process.platform === 'darwin') {
      // Auf macOS: erstelle LaunchAgent
      const launchAgentPath = path.join(
        process.env.HOME || '',
        'Library/LaunchAgents/com.slack-status-bot.plist'
      );
      
      let appPath = process.execPath;
      const appMatch = appPath.match(/^(.+?\.app)/);
      if (appMatch) {
        appPath = appMatch[1];
      }
      
      logToFile('[AutoLaunch] LaunchAgent path: ' + launchAgentPath);
      logToFile('[AutoLaunch] App path: ' + appPath);
      
      if (enabled) {
        // Erstelle LaunchAgent Plist
        const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.slack-status-bot</string>
  <key>Program</key>
  <string>${appPath}/Contents/MacOS/Slack Status Bot</string>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${process.env.HOME}/Library/Logs/slack-status-bot.log</string>
  <key>StandardErrorPath</key>
  <string>${process.env.HOME}/Library/Logs/slack-status-bot-error.log</string>
</dict>
</plist>`;
        
        // Erstelle Verzeichnis falls nicht vorhanden
        const launchAgentDir = path.dirname(launchAgentPath);
        if (!fs.existsSync(launchAgentDir)) {
          fs.mkdirSync(launchAgentDir, { recursive: true });
        }
        
        // Schreibe Plist
        fs.writeFileSync(launchAgentPath, plistContent, 'utf-8');
        logToFile('[AutoLaunch] LaunchAgent plist written');
        
        // Lade den LaunchAgent mit launchctl
        const { execSync } = require('child_process');
        try {
          execSync(`launchctl load "${launchAgentPath}"`, { stdio: 'pipe' });
          logToFile('[AutoLaunch] LaunchAgent loaded successfully with launchctl');
        } catch (error) {
          // Wenn es bereits geladen ist, bekommst du einen Fehler - das ist OK
          if (error.toString().includes('already loaded')) {
            logToFile('[AutoLaunch] LaunchAgent was already loaded');
          } else {
            logToFile('[AutoLaunch] Error loading with launchctl: ' + error.message);
            console.log('[AutoLaunch] launchctl error:', error.toString());
          }
        }
      } else {
        // Unlade und lösche LaunchAgent
        if (fs.existsSync(launchAgentPath)) {
          const { execSync } = require('child_process');
          try {
            execSync(`launchctl unload "${launchAgentPath}"`, { stdio: 'pipe' });
            logToFile('[AutoLaunch] LaunchAgent unloaded');
          } catch (error) {
            if (!error.toString().includes('not loaded')) {
              logToFile('[AutoLaunch] Error unloading: ' + error.message);
            }
          }
          
          // Lösche die Datei
          fs.unlinkSync(launchAgentPath);
          logToFile('[AutoLaunch] LaunchAgent plist removed');
        }
      }
      
      return { success: true, enabled: enabled };
    } else {
      // Windows/Linux: nutze setLoginItemSettings wenn verfügbar
      app.setLoginItemSettings({
        openAtLogin: enabled,
        openAsHidden: true,
      });
      return { success: true, enabled: enabled };
    }
  } catch (error) {
    console.error('[AutoLaunch] Error:', error);
    logToFile('[AutoLaunch] Error: ' + error.message);
    return { success: false, error: error.message };
  }
});

/**
 * Get auto-launch status
 */
ipcMain.handle('get-auto-launch', async (event) => {
  try {
    if (process.platform === 'darwin') {
      // Auf macOS: prüfe ob LaunchAgent existiert
      const launchAgentPath = path.join(
        process.env.HOME || '',
        'Library/LaunchAgents/com.slack-status-bot.plist'
      );
      const enabled = fs.existsSync(launchAgentPath);
      logToFile('[AutoLaunch] LaunchAgent exists: ' + enabled);
      return { success: true, enabled: enabled };
    } else {
      // Windows/Linux
      const settings = app.getLoginItemSettings();
      return { success: true, enabled: settings.openAtLogin };
    }
  } catch (error) {
    console.error('Error getting auto-launch status:', error);
    logToFile('[AutoLaunch] Error: ' + error.message);
    return { success: false, error: error.message };
  }
});

/**
 * Check if this is the first run (for onboarding)
 */
ipcMain.handle('is-first-run', async (event) => {
  try {
    const isFirstRun = !config.hasCompletedFirstRun;
    logToFile('[FirstRun] is-first-run: ' + isFirstRun);
    return { success: true, isFirstRun };
  } catch (error) {
    console.error('Error checking first run:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Mark first run as complete
 */
ipcMain.handle('complete-first-run', async (event) => {
  try {
    config.hasCompletedFirstRun = true;
    saveConfig(config);
    logToFile('[FirstRun] First run marked as complete');
    return { success: true };
  } catch (error) {
    console.error('Error completing first run:', error);
    return { success: false, error: error.message };
  }
});
