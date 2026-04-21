function buildTrayMenuTemplate({
  daemon,
  updateAvailable,
  onShow,
  onGoOnline,
  onGoAway,
  onOpenHolidayModal,
  onSetQuickActionStatus,
  onOpenUpdate,
  onQuit,
}) {
  const menuItems = [
    {
      label: 'Show',
      click: onShow,
    },
    {
      label: 'Go Online',
      click: onGoOnline,
    },
    {
      label: 'Go Away',
      click: onGoAway,
    },
  ];

  if (daemon) {
    try {
      const statusConfig = daemon.getStatusConfiguration();
      const quickActions = statusConfig.filter(status => status.quickActionLabel);

      if (quickActions.length > 0) {
        menuItems.push({
          label: 'Quick Actions',
          submenu: quickActions.map(status => ({
            label: status.quickActionLabel || `${status.emoji} ${status.message}`,
            click: async () => {
              if (status.id === 'holiday') {
                await onOpenHolidayModal();
                return;
              }

              await onSetQuickActionStatus(status);
            },
          })),
        });
      }
    } catch (_error) {
      // Ignore quick-action rendering errors and keep the rest of the tray menu available.
    }
  }

  if (updateAvailable) {
    menuItems.push(
      {
        type: 'separator',
      },
      {
        label: `🚀 Update available (v${updateAvailable.version})`,
        click: onOpenUpdate,
      }
    );
  }

  menuItems.push(
    {
      type: 'separator',
    },
    {
      label: 'Quit',
      click: onQuit,
    }
  );

  return menuItems;
}

function createTrayBridge({
  app,
  Tray,
  Menu,
  nativeImage,
  shell,
  fs,
  path,
  __dirname,
  log,
  showWindow,
  getDaemon,
  getUpdateAvailable,
  onQuit,
  onOpenHolidayModal,
}) {
  let tray = null;

  function getIconPath() {
    const templateName = 'tray-iconTemplate.png';
    const fallbackName = 'tray-icon.png';

    const pathsToTry = [
      path.join(__dirname, '../assets', templateName),
      path.join(app.getAppPath(), 'assets', templateName),
      path.join(__dirname, '../assets', fallbackName),
      path.join(app.getAppPath(), 'assets', fallbackName),
    ];

    log('[Tray] Trying these paths:');
    pathsToTry.forEach(candidatePath => {
      log(`[Tray]   ${candidatePath} exists: ${fs.existsSync(candidatePath)}`);
    });

    return pathsToTry.find(candidatePath => fs.existsSync(candidatePath));
  }

  function buildTrayImage(iconPath) {
    try {
      const iconImage = nativeImage.createFromPath(iconPath);
      if (iconImage.isEmpty()) {
        log('[Tray] Warning: loaded image is empty');
        return null;
      }

      const isTemplate = iconPath.includes('Template');
      const resized = iconImage.resize({ width: 22, height: 22 });
      if (isTemplate && process.platform === 'darwin') {
        resized.setTemplateImage(true);
        log('[Tray] Marked as macOS template image');
      }
      log('[Tray] Icon prepared at 22x22');
      return resized;
    } catch (error) {
      log(`[Tray] Warning: Could not prepare icon: ${error.message}`);
      return null;
    }
  }

  function refreshMenu() {
    if (!tray) {
      return;
    }

    const menuTemplate = buildTrayMenuTemplate({
      daemon: getDaemon(),
      updateAvailable: getUpdateAvailable(),
      onShow: () => {
        void showWindow();
      },
      onGoOnline: async () => {
        const daemon = getDaemon();
        if (daemon) {
          await daemon.goOnline();
        }
      },
      onGoAway: async () => {
        const daemon = getDaemon();
        if (daemon) {
          await daemon.goAway();
        }
      },
      onOpenHolidayModal: async () => {
        await showWindow();
        onOpenHolidayModal();
      },
      onSetQuickActionStatus: async status => {
        const daemon = getDaemon();
        if (daemon) {
          await daemon.setStatus(status.emoji, status.message);
        }
      },
      onOpenUpdate: () => {
        const updateAvailable = getUpdateAvailable();
        if (updateAvailable) {
          shell.openExternal(
            `https://gitlab.com/wihel_de/slack-status-bot-custom/-/releases/v${updateAvailable.version}`
          );
        }
      },
      onQuit,
    });

    tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
    tray.setTitle(getUpdateAvailable() ? '●' : '');
  }

  function createTray() {
    log('[Tray] Starting tray creation...');
    log(`[Tray] __dirname: ${__dirname}`);

    if (tray) {
      log('[Tray] Tray already exists, updating context menu instead of recreating');
      refreshMenu();
      return tray;
    }

    const trayIconPath = getIconPath();
    if (!trayIconPath) {
      log('[Tray] ERROR: No icon found at any path!');
      return null;
    }

    try {
      log(`[Tray] Loading icon from: ${trayIconPath}`);
      const trayImage = buildTrayImage(trayIconPath);
      tray = new Tray(trayImage || trayIconPath);
      tray.setToolTip('Slack Status Bot');
      refreshMenu();
      log('[Tray] Tray icon created successfully');
      return tray;
    } catch (error) {
      log(`[Tray] ERROR: Failed to create tray: ${error.message}`);
      log(`[Tray] Stack: ${error.stack || 'no stack'}`);
      tray = null;
      return null;
    }
  }

  function destroyTray() {
    if (!tray) {
      return;
    }

    tray.destroy();
    tray = null;
  }

  return {
    createTray,
    refreshMenu,
    destroyTray,
    hasTray: () => Boolean(tray),
    getTray: () => tray,
  };
}

module.exports = {
  buildTrayMenuTemplate,
  createTrayBridge,
};
