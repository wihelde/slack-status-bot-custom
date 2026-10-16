import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { YouTubeMusicAdapter } from '../youtubeMusic';

vi.mock('../probes/processProbe', () => ({
  isMacApplicationRunning: vi.fn(),
}));

vi.mock('../probes/nowPlayingProbe', () => ({
  getMacNowPlayingInfo: vi.fn(),
}));

import { getMacNowPlayingInfo } from '../probes/nowPlayingProbe';
import { isMacApplicationRunning } from '../probes/processProbe';

describe('YouTubeMusicAdapter', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    vi.mocked(isMacApplicationRunning).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  });

  it('returns the playing PWA track as a source status', async () => {
    vi.mocked(getMacNowPlayingInfo).mockResolvedValue({
      app: 'YouTube Music',
      title: 'Cologne',
      artist: 'beabadoobee',
      album: 'Our Extended Play',
      playbackRate: 1,
    });

    await expect(new YouTubeMusicAdapter().getStatus()).resolves.toEqual({
      name: 'YouTube Music',
      isActive: true,
      title: 'beabadoobee - Cologne',
      emoji: ':youtube-music:',
      message: 'beabadoobee - Cologne',
    });
  });

  it('uses the title when the artist is unavailable', async () => {
    vi.mocked(getMacNowPlayingInfo).mockResolvedValue({
      app: 'YouTube Music',
      title: 'Cologne',
      artist: null,
      album: null,
      playbackRate: 1,
    });

    const status = await new YouTubeMusicAdapter().getStatus();

    expect(status.message).toBe('Cologne');
  });

  it('returns inactive for paused playback', async () => {
    vi.mocked(getMacNowPlayingInfo).mockResolvedValue({
      app: 'YouTube Music',
      title: 'Cologne',
      artist: 'beabadoobee',
      album: 'Our Extended Play',
      playbackRate: 0,
    });

    await expect(new YouTubeMusicAdapter().getStatus()).resolves.toEqual({
      name: 'YouTube Music',
      isActive: false,
    });
  });

  it('keeps the previous track active across one empty poll during a skip', async () => {
    vi.mocked(getMacNowPlayingInfo)
      .mockResolvedValueOnce({
        app: 'YouTube Music',
        title: 'Old Track',
        artist: 'Artist',
        album: null,
        playbackRate: 1,
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        app: 'YouTube Music',
        title: 'New Track',
        artist: 'Artist',
        album: null,
        playbackRate: 1,
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    const adapter = new YouTubeMusicAdapter();
    const previous = await adapter.getStatus();

    await expect(adapter.getStatus()).resolves.toEqual(previous);
    now.mockReturnValue(1000);
    await expect(adapter.getStatus()).resolves.toEqual(previous);
    now.mockReturnValue(1100);
    const current = await adapter.getStatus();
    expect(current).toMatchObject({
      isActive: true,
      message: 'Artist - New Track',
    });
    now.mockReturnValue(1200);
    await expect(adapter.getStatus()).resolves.toEqual(current);
    now.mockReturnValue(2801);
    await expect(adapter.getStatus()).resolves.toEqual({
      name: 'YouTube Music',
      isActive: false,
    });
  });

  it('does not mistake media from the parent browser for YouTube Music', async () => {
    vi.mocked(getMacNowPlayingInfo).mockResolvedValue({
      app: 'Brave Browser',
      title: 'An unrelated video',
      artist: 'Video channel',
      album: null,
      playbackRate: 1,
    });

    await expect(new YouTubeMusicAdapter().getStatus()).resolves.toEqual({
      name: 'YouTube Music',
      isActive: false,
    });
  });

  it('does not query Now Playing when the PWA is not running', async () => {
    vi.mocked(isMacApplicationRunning).mockResolvedValue(false);

    await expect(new YouTubeMusicAdapter().getStatus()).resolves.toEqual({
      name: 'YouTube Music',
      isActive: false,
    });
    expect(getMacNowPlayingInfo).not.toHaveBeenCalled();
  });

  it('does not probe when disabled', async () => {
    const adapter = new YouTubeMusicAdapter();
    adapter.setEnabled(false);

    await expect(adapter.getStatus()).resolves.toEqual({
      name: 'YouTube Music',
      isActive: false,
    });
    expect(isMacApplicationRunning).not.toHaveBeenCalled();
    expect(getMacNowPlayingInfo).not.toHaveBeenCalled();
  });

  it('is only available on macOS', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    expect(new YouTubeMusicAdapter().isAvailable()).toBe(false);
  });

  it('returns inactive when metadata is unavailable or incomplete', async () => {
    vi.mocked(getMacNowPlayingInfo).mockResolvedValueOnce(null);
    await expect(new YouTubeMusicAdapter().getStatus()).resolves.toEqual({
      name: 'YouTube Music',
      isActive: false,
    });

    vi.mocked(getMacNowPlayingInfo).mockResolvedValueOnce({
      app: 'YouTube Music',
      title: null,
      artist: 'beabadoobee',
      album: null,
      playbackRate: 1,
    });
    await expect(new YouTubeMusicAdapter().getStatus()).resolves.toEqual({
      name: 'YouTube Music',
      isActive: false,
    });
  });

  it('truncates long status messages to the Slack limit', async () => {
    vi.mocked(getMacNowPlayingInfo).mockResolvedValue({
      app: 'YouTube Music',
      title: 'T'.repeat(100),
      artist: 'Artist',
      album: null,
      playbackRate: 1,
    });

    const status = await new YouTubeMusicAdapter().getStatus();

    expect(status.message).toHaveLength(100);
    expect(status.message?.endsWith('...')).toBe(true);
  });
});
