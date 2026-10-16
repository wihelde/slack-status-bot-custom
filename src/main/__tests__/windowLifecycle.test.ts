import { describe, expect, it, vi } from 'vitest';
import { createWindowLifecycle } from '../windowLifecycle';

describe('windowLifecycle', () => {
  function createHarness() {
    const webContents = {
      send: vi.fn(),
      openDevTools: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    };
    const windowInstance = {
      show: vi.fn(),
      focus: vi.fn(),
      hide: vi.fn(),
      loadURL: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      webContents,
    };
    const BrowserWindow = vi.fn().mockImplementation(function () {
      return windowInstance;
    });

    const lifecycle = createWindowLifecycle({
      app: {},
      BrowserWindow,
      shell: { openExternal: vi.fn() },
      isDev: false,
      preloadPath: '/runtime/dist/preload.js',
      getStartUrl: () => 'file:///runtime/build/index.html',
      hasTray: () => true,
      onClosed: vi.fn(),
    });

    return { lifecycle, BrowserWindow, windowInstance };
  }

  it('creates the renderer window with a preload-compatible security configuration', () => {
    const { lifecycle, BrowserWindow, windowInstance } = createHarness();

    lifecycle.createWindow();

    expect(BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        webPreferences: {
          preload: '/runtime/dist/preload.js',
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
          enableRemoteModule: false,
        },
      })
    );
    expect(windowInstance.loadURL).toHaveBeenCalledWith('file:///runtime/build/index.html');
  });

  it('can create the renderer window without showing it when ready', () => {
    const { lifecycle, windowInstance } = createHarness();

    lifecycle.createWindow({ showOnReady: false });

    expect(windowInstance.once).not.toHaveBeenCalledWith('ready-to-show', expect.any(Function));
  });
});
