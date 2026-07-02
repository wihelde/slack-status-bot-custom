import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HuddleAdapter, TeamsAdapter, ZoomAdapter } from '../meetings';

vi.mock('../probes/networkProbe', () => ({
  hasMacUdpConnectionMatch: vi.fn(),
}));

vi.mock('../probes/processProbe', () => ({
  isWindowsProcessRunning: vi.fn(),
}));

import { hasMacUdpConnectionMatch } from '../probes/networkProbe';
import { isWindowsProcessRunning } from '../probes/processProbe';

describe('meeting adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps Zoom-specific macOS matching rules and output copy', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    vi.mocked(hasMacUdpConnectionMatch).mockResolvedValue(true);

    await expect(new ZoomAdapter().getStatus()).resolves.toEqual({
      name: 'Zoom',
      isActive: true,
      emoji: ':zoom_3:',
      message: 'In a meeting - will answer later',
    });

    expect(hasMacUdpConnectionMatch).toHaveBeenCalledWith('zoom', '([0-9]{1,3})$');
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  it('keeps Zoom-specific Windows probe configuration', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    vi.mocked(isWindowsProcessRunning).mockResolvedValue(false);

    await new ZoomAdapter().getStatus();

    expect(isWindowsProcessRunning).toHaveBeenCalledWith('Zoom.exe');
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  it('keeps Teams-specific macOS matching rules and output copy', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    vi.mocked(hasMacUdpConnectionMatch)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await expect(new TeamsAdapter().getStatus()).resolves.toEqual({
      name: 'Microsoft Teams',
      isActive: true,
      emoji: ':teams:',
      message: 'In a meeting - will answer later',
    });

    expect(hasMacUdpConnectionMatch).toHaveBeenCalledWith(
      'MSTeams',
      '([0-9]{1,3}[.]){3}[0-9]{1,3}[:](500[0-9]{2})$'
    );
    expect(hasMacUdpConnectionMatch).toHaveBeenCalledWith(
      'Microsoft',
      '([0-9]{1,3}[.]){3}[0-9]{1,3}[:](500[0-9]{2})$'
    );
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  it('keeps Teams-specific Windows probe configuration', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    vi.mocked(isWindowsProcessRunning).mockResolvedValue(false);

    await new TeamsAdapter().getStatus();

    expect(isWindowsProcessRunning).toHaveBeenCalledWith('Teams.exe');
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  it('keeps Huddle-specific macOS matching rules and output copy', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    vi.mocked(hasMacUdpConnectionMatch).mockResolvedValue(true);

    await expect(new HuddleAdapter().getStatus()).resolves.toEqual({
      name: 'Slack Huddle',
      isActive: true,
      emoji: ':headphones:',
      message: 'In a huddle - will answer later',
    });

    expect(hasMacUdpConnectionMatch).toHaveBeenCalledWith('Slack', '([0-9]{5})$');
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  it('keeps Huddle-specific Windows probe configuration', async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    vi.mocked(isWindowsProcessRunning).mockResolvedValue(false);

    await new HuddleAdapter().getStatus();

    expect(isWindowsProcessRunning).toHaveBeenCalledWith('slack.exe');
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });
});
