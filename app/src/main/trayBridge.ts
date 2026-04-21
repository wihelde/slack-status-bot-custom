import type { CustomStatusConfig } from '../config/statusConfig';
import type { AppUpdateSnapshot } from '../contracts/appSnapshot';

interface TrayMenuAction {
  (): void | Promise<void>;
}

interface TrayMenuItem {
  label?: string;
  click?: TrayMenuAction;
  type?: 'separator';
  submenu?: TrayMenuItem[];
}

interface TrayMenuStatus extends Pick<CustomStatusConfig, 'id' | 'emoji' | 'message' | 'quickActionLabel'> {}

interface TrayMenuDaemon {
  getStatusConfiguration: () => TrayMenuStatus[];
  goOnline: () => Promise<boolean>;
  goAway: () => Promise<boolean>;
  setStatus: (emoji: string, message: string) => Promise<boolean>;
}

interface TrayBridgeDependencies {
  app: {
    getAppPath: () => string;
  };
  Tray: new (image: string | TrayNativeImage) => TrayInstance;
  Menu: {
    buildFromTemplate: (items: TrayMenuItem[]) => unknown;
  };
  nativeImage: {
    createFromPath: (path: string) => TrayNativeImage;
  };
  shell: {
    openExternal: (url: string) => void;
  };
  fs: {
    existsSync: (path: string) => boolean;
  };
  path: {
    join: (...parts: string[]) => string;
  };
  runtimeDirname: string;
  log: (message: string) => void;
  showWindow: () => Promise<void>;
  getDaemon: () => TrayMenuDaemon | null;
  getUpdateAvailable: () => AppUpdateSnapshot | null;
  onQuit: () => void;
  onOpenHolidayModal: () => void;
}

interface TrayInstance {
  setToolTip: (value: string) => void;
  setImage: (image: unknown) => unknown;
  setContextMenu: (menu: unknown) => void;
  setTitle: (title: string) => void;
  destroy: () => void;
}

interface TrayNativeImage {
  isEmpty: () => boolean;
  resize: (size: { width: number; height: number }) => TrayNativeImage;
  setTemplateImage: (value: boolean) => void;
}

export interface TrayBridge {
  createTray: () => TrayInstance | null;
  refreshMenu: () => void;
  destroyTray: () => void;
  hasTray: () => boolean;
  getTray: () => TrayInstance | null;
}

export function buildTrayMenuTemplate({
  daemon,
  updateAvailable,
  onShow,
  onGoOnline,
  onGoAway,
  onOpenHolidayModal,
  onSetQuickActionStatus,
  onOpenUpdate,
  onQuit,
}: {
  daemon: TrayMenuDaemon | null;
  updateAvailable: AppUpdateSnapshot | null;
  onShow: TrayMenuAction;
  onGoOnline: TrayMenuAction;
  onGoAway: TrayMenuAction;
  onOpenHolidayModal: TrayMenuAction;
  onSetQuickActionStatus: (status: TrayMenuStatus) => Promise<void>;
  onOpenUpdate: TrayMenuAction;
  onQuit: TrayMenuAction;
}): TrayMenuItem[] {
  const menuItems: TrayMenuItem[] = [
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
        label: `Update available (v${updateAvailable.version})`,
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

export function createTrayBridge({
  app,
  Tray,
  Menu,
  nativeImage,
  shell,
  fs,
  path,
  runtimeDirname,
  log,
  showWindow,
  getDaemon,
  getUpdateAvailable,
  onQuit,
  onOpenHolidayModal,
}: TrayBridgeDependencies): TrayBridge {
  let tray: TrayInstance | null = null;

  function getIconPath(): string | undefined {
    const templateName = 'tray-iconTemplate.png';
    const fallbackName = 'tray-icon.png';

    const pathsToTry = [
      path.join(runtimeDirname, '../assets', templateName),
      path.join(app.getAppPath(), 'assets', templateName),
      path.join(runtimeDirname, '../assets', fallbackName),
      path.join(app.getAppPath(), 'assets', fallbackName),
    ];

    log('[Tray] Trying these paths:');
    pathsToTry.forEach(candidatePath => {
      log(`[Tray]   ${candidatePath} exists: ${fs.existsSync(candidatePath)}`);
    });

    return pathsToTry.find(candidatePath => fs.existsSync(candidatePath));
  }

  function buildTrayImage(iconPath: string): TrayNativeImage | null {
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
      const message = error instanceof Error ? error.message : String(error);
      log(`[Tray] Warning: Could not prepare icon: ${message}`);
      return null;
    }
  }

  function refreshMenu(): void {
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

  function createTray(): TrayInstance | null {
    log('[Tray] Starting tray creation...');
    log(`[Tray] runtimeDirname: ${runtimeDirname}`);

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
      const message = error instanceof Error ? error.message : String(error);
      const stack =
        error instanceof Error && typeof error.stack === 'string' ? error.stack : 'no stack';
      log(`[Tray] ERROR: Failed to create tray: ${message}`);
      log(`[Tray] Stack: ${stack}`);
      tray = null;
      return null;
    }
  }

  function destroyTray(): void {
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
