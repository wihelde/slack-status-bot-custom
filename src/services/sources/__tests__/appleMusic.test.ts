import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppleMusicAdapter } from '../appleMusic';

vi.mock('../probes/appleScriptProbe', () => ({
  readAppleScriptOutput: vi.fn(),
}));

import { readAppleScriptOutput } from '../probes/appleScriptProbe';

describe('AppleMusicAdapter', () => {
  const originalPlatform = process.platform;
  let adapter: AppleMusicAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    adapter = new AppleMusicAdapter();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  it('is only available on macOS', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    expect(new AppleMusicAdapter().isAvailable()).toBe(true);

    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    expect(new AppleMusicAdapter().isAvailable()).toBe(false);

  });

  it('returns inactive status when disabled without probing', async () => {
    adapter.setEnabled(false);

    await expect(adapter.getStatus()).resolves.toEqual({
      name: 'Apple Music',
      isActive: false,
    });

    expect(readAppleScriptOutput).not.toHaveBeenCalled();
  });

  it('returns active status when Apple Music is playing', async () => {
    vi.mocked(readAppleScriptOutput)
      .mockResolvedValueOnce('playing')
      .mockResolvedValueOnce('Artist - Song');

    await expect(adapter.getStatus()).resolves.toEqual({
      name: 'Apple Music',
      isActive: true,
      title: 'Artist - Song',
      emoji: ':apple_music:',
      message: 'Artist - Song',
    });
  });

  it('falls back to inactive status when playback is not active', async () => {
    vi.mocked(readAppleScriptOutput).mockResolvedValueOnce('stopped');

    await expect(adapter.getStatus()).resolves.toEqual({
      name: 'Apple Music',
      isActive: false,
    });
  });

  it('delegates Apple Music probes through the shared music detector path', async () => {
    vi.mocked(readAppleScriptOutput)
      .mockResolvedValueOnce('playing')
      .mockResolvedValueOnce('Artist - Song');

    await adapter.getStatus();

    expect(readAppleScriptOutput).toHaveBeenNthCalledWith(1, [
      'try',
      'if application "Music" is running then',
      'tell application "Music" to player state',
      'end if',
      'end try',
    ]);
    expect(readAppleScriptOutput).toHaveBeenNthCalledWith(2, [
      'try',
      'if application "Music" is running then',
      'tell application "Music" to artist of current track & " - " & name of current track',
      'end if',
      'end try',
    ]);
  });
});
