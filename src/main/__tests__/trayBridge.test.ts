import { describe, expect, it, vi } from 'vitest';
import { buildTrayMenuTemplate, createTrayBridge } from '../trayBridge';

function buildMockDeps(overrides: Record<string, unknown> = {}) {
  const resizedImage = {
    isEmpty: () => false,
    resize: vi.fn().mockReturnThis(),
    setTemplateImage: vi.fn(),
  };
  const loadedImage = {
    isEmpty: () => false,
    resize: vi.fn().mockReturnValue(resizedImage),
    setTemplateImage: vi.fn(),
  };
  const trayInstance = {
    setToolTip: vi.fn(),
    setImage: vi.fn(),
    setContextMenu: vi.fn(),
    setTitle: vi.fn(),
    destroy: vi.fn(),
  };
  const TrayConstructor = vi.fn().mockImplementation(function () {
    return trayInstance;
  });

  const defaults = {
    app: { getAppPath: () => '/app' },
    Tray: TrayConstructor,
    Menu: { buildFromTemplate: vi.fn().mockReturnValue('menu') },
    nativeImage: { createFromPath: vi.fn().mockReturnValue(loadedImage) },
    shell: { openExternal: vi.fn() },
    fs: { existsSync: vi.fn().mockReturnValue(false) },
    path: { join: (...parts: string[]) => parts.join('/') },
    runtimeDirname: '/runtime/dist',
    log: vi.fn(),
    showWindow: vi.fn().mockResolvedValue(undefined),
    getDaemon: () => null,
    getUpdateAvailable: () => null,
    onQuit: vi.fn(),
    onOpenHolidayModal: vi.fn(),
  };

  return {
    deps: { ...defaults, ...overrides } as Parameters<typeof createTrayBridge>[0],
    mocks: { trayInstance, TrayConstructor, loadedImage, resizedImage },
  };
}

describe('trayBridge', () => {
  it('builds quick actions and update items from boundary inputs', async () => {
    const onOpenHolidayModal = vi.fn();
    const onSetQuickActionStatus = vi.fn();
    const template = buildTrayMenuTemplate({
      daemon: {
        getStatusConfiguration: () => [
          {
            id: 'holiday',
            emoji: ':palm_tree:',
            message: 'Out',
            quickActionLabel: 'Holiday',
          },
          {
            id: 'focus',
            emoji: ':focus:',
            message: 'Heads down',
            quickActionLabel: 'Focus',
          },
        ],
        goOnline: vi.fn().mockResolvedValue(true),
        goAway: vi.fn().mockResolvedValue(true),
        setStatus: vi.fn().mockResolvedValue(true),
      },
      updateAvailable: {
        version: '2.1.0',
        releaseDate: '2026-04-20T09:00:00.000Z',
      },
      onShow: vi.fn(),
      onGoOnline: vi.fn(),
      onGoAway: vi.fn(),
      onOpenHolidayModal,
      onSetQuickActionStatus,
      onOpenUpdate: vi.fn(),
      onQuit: vi.fn(),
    });

    const quickActions = template.find((item: { label?: string }) => item.label === 'Quick Actions');
    expect(quickActions).toBeTruthy();
    const submenu = quickActions?.submenu ?? [];
    expect(submenu).toHaveLength(2);

    await submenu[0]?.click?.();
    await submenu[1]?.click?.();

    expect(onOpenHolidayModal).toHaveBeenCalledTimes(1);
    expect(onSetQuickActionStatus).toHaveBeenCalledWith({
      id: 'focus',
      emoji: ':focus:',
      message: 'Heads down',
      quickActionLabel: 'Focus',
    });
    expect(template.some((item: { label?: string }) => item.label?.includes('Update available'))).toBe(
      true
    );
  });

  describe('createTrayBridge', () => {
    it('prefers the template icon over the plain icon', () => {
      const { deps, mocks } = buildMockDeps({
        fs: {
          existsSync: (p: string) => p.includes('tray-iconTemplate.png'),
        },
      });

      const bridge = createTrayBridge(deps);
      bridge.createTray();

      expect(mocks.TrayConstructor).toHaveBeenCalledTimes(1);
      expect(deps.nativeImage.createFromPath).toHaveBeenCalledWith(
        expect.stringContaining('tray-iconTemplate.png')
      );
    });

    it('falls back to plain icon when template is missing', () => {
      const { deps, mocks } = buildMockDeps({
        fs: {
          existsSync: (p: string) => p.includes('tray-icon.png') && !p.includes('Template'),
        },
      });

      const bridge = createTrayBridge(deps);
      bridge.createTray();

      expect(mocks.TrayConstructor).toHaveBeenCalledTimes(1);
      expect(deps.nativeImage.createFromPath).toHaveBeenCalledWith(
        expect.stringContaining('tray-icon.png')
      );
    });

    it('passes the prepared nativeImage to the Tray constructor', () => {
      const { deps, mocks } = buildMockDeps({
        fs: { existsSync: () => true },
      });

      const bridge = createTrayBridge(deps);
      bridge.createTray();

      expect(mocks.loadedImage.resize).toHaveBeenCalledWith({ width: 22, height: 22 });
      expect(mocks.TrayConstructor).toHaveBeenCalledWith(mocks.resizedImage);
    });

    it('sets the template flag after resize on darwin when using a template icon', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const { deps, mocks } = buildMockDeps({
        fs: {
          existsSync: (p: string) => p.includes('tray-iconTemplate.png'),
        },
      });

      const bridge = createTrayBridge(deps);
      bridge.createTray();

      expect(mocks.resizedImage.setTemplateImage).toHaveBeenCalledWith(true);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('does not set the template flag for a non-template icon', () => {
      const { deps, mocks } = buildMockDeps({
        fs: {
          existsSync: (p: string) => p.includes('tray-icon.png') && !p.includes('Template'),
        },
      });

      const bridge = createTrayBridge(deps);
      bridge.createTray();

      expect(mocks.resizedImage.setTemplateImage).not.toHaveBeenCalled();
    });

    it('returns null when no icon file is found', () => {
      const { deps, mocks } = buildMockDeps({
        fs: { existsSync: () => false },
      });

      const bridge = createTrayBridge(deps);
      const result = bridge.createTray();

      expect(result).toBeNull();
      expect(mocks.TrayConstructor).not.toHaveBeenCalled();
    });

    it('falls back to the raw path when nativeImage is empty', () => {
      const emptyImage = {
        isEmpty: () => true,
        resize: vi.fn(),
        setTemplateImage: vi.fn(),
      };
      const { deps, mocks } = buildMockDeps({
        fs: { existsSync: () => true },
        nativeImage: { createFromPath: vi.fn().mockReturnValue(emptyImage) },
      });

      const bridge = createTrayBridge(deps);
      bridge.createTray();

      expect(mocks.TrayConstructor).toHaveBeenCalledWith(
        expect.stringContaining('tray-iconTemplate.png')
      );
    });

    it('reuses existing tray instead of creating a second one', () => {
      const { deps, mocks } = buildMockDeps({
        fs: { existsSync: () => true },
      });

      const bridge = createTrayBridge(deps);
      bridge.createTray();
      bridge.createTray();

      expect(mocks.TrayConstructor).toHaveBeenCalledTimes(1);
      expect(mocks.trayInstance.setContextMenu).toHaveBeenCalledTimes(2);
    });
  });
});
