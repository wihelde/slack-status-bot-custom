import { describe, expect, it, vi } from 'vitest';
import { createAutoLaunchAdapter } from '../autoLaunchAdapter';

describe('autoLaunchAdapter', () => {
  it('uses login item settings on non-mac platforms', async () => {
    const setLoginItemSettings = vi.fn();
    const adapter = createAutoLaunchAdapter({
      app: {
        setLoginItemSettings,
        getLoginItemSettings: () => ({ openAtLogin: true }),
      },
      fs: {
        existsSync: vi.fn(),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        unlinkSync: vi.fn(),
      },
      path: require('path'),
      platform: 'linux',
      homeDir: '/tmp/home',
      execSync: vi.fn(),
      processExecPath: '/Applications/Slack Status Bot.app/Contents/MacOS/Slack Status Bot',
      log: vi.fn(),
    });

    await expect(adapter.setEnabled(true)).resolves.toEqual({ enabled: true });
    await expect(adapter.getStatus()).resolves.toEqual({ enabled: true });
    expect(setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      openAsHidden: true,
    });
  });
});
