import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SpotifyAdapter } from '../spotify';

vi.mock('../probes/appleScriptProbe', () => ({
  readAppleScriptOutput: vi.fn(),
}));

vi.mock('../probes/processProbe', () => ({
  isMacProcessRunning: vi.fn(),
}));

import { readAppleScriptOutput } from '../probes/appleScriptProbe';
import { isMacProcessRunning } from '../probes/processProbe';

describe('SpotifyAdapter', () => {
  let adapter: SpotifyAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new SpotifyAdapter();
  });

  it('is only available on macOS', () => {
    const originalPlatform = process.platform;

    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    expect(new SpotifyAdapter().isAvailable()).toBe(true);

    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    expect(new SpotifyAdapter().isAvailable()).toBe(false);

    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  it('returns inactive status when disabled without probing', async () => {
    adapter.setEnabled(false);

    await expect(adapter.getStatus()).resolves.toEqual({
      name: 'Spotify',
      isActive: false,
    });

    expect(isMacProcessRunning).not.toHaveBeenCalled();
    expect(readAppleScriptOutput).not.toHaveBeenCalled();
  });

  it('returns active status when Spotify is running, playing, and exposes a track', async () => {
    vi.mocked(isMacProcessRunning).mockResolvedValue(true);
    vi.mocked(readAppleScriptOutput)
      .mockResolvedValueOnce('playing')
      .mockResolvedValueOnce('Artist - Song');

    await expect(adapter.getStatus()).resolves.toEqual({
      name: 'Spotify',
      isActive: true,
      title: 'Artist - Song',
      emoji: ':spotify_2:',
      message: 'Artist - Song',
    });
  });

  it('delegates Spotify-specific probes through the shared music detector path', async () => {
    vi.mocked(isMacProcessRunning).mockResolvedValue(true);
    vi.mocked(readAppleScriptOutput)
      .mockResolvedValueOnce('playing')
      .mockResolvedValueOnce('Artist - Song');

    await adapter.getStatus();

    expect(isMacProcessRunning).toHaveBeenCalledWith('Spotify');
    expect(readAppleScriptOutput).toHaveBeenNthCalledWith(1, [
      'try',
      'if application "Spotify" is running then',
      'tell application "Spotify" to player state',
      'end if',
      'end try',
    ]);
    expect(readAppleScriptOutput).toHaveBeenNthCalledWith(2, [
      'try',
      'if application "Spotify" is running then',
      'tell application "Spotify"',
      'set track_artist to artist of current track',
      'set track_name to name of current track',
      'set podcast to album of current track',
      'if track_artist = "" then',
      'podcast & " - " & track_name',
      'else',
      'track_artist & " - " & track_name',
      'end if',
      'end tell',
      'end if',
      'end try',
    ]);
  });

  it('falls back to inactive status when probes do not find an active track', async () => {
    vi.mocked(isMacProcessRunning).mockResolvedValue(true);
    vi.mocked(readAppleScriptOutput).mockResolvedValueOnce('paused');

    await expect(adapter.getStatus()).resolves.toEqual({
      name: 'Spotify',
      isActive: false,
    });
  });

  it('truncates long track titles at the adapter boundary', async () => {
    vi.mocked(isMacProcessRunning).mockResolvedValue(true);
    vi.mocked(readAppleScriptOutput)
      .mockResolvedValueOnce('playing')
      .mockResolvedValueOnce('A'.repeat(110));

    const status = await adapter.getStatus();

    expect(status.isActive).toBe(true);
    expect(status.message).toHaveLength(100);
    expect(status.message?.endsWith('...')).toBe(true);
  });
});
