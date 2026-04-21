import { describe, expect, it, vi } from 'vitest';
import { MusicDetector } from '../detectors/musicDetector';

describe('MusicDetector', () => {
  it('returns inactive when the platform is unsupported', async () => {
    const detector = new MusicDetector({
      name: 'Spotify',
      emoji: ':spotify_2:',
      isAvailable: () => false,
      isRunning: vi.fn(),
      getPlayerState: vi.fn(),
      getTrack: vi.fn(),
    });

    await expect(detector.getStatus()).resolves.toEqual({
      name: 'Spotify',
      isActive: false,
    });
  });

  it('returns inactive when the app is not running', async () => {
    const isRunning = vi.fn().mockResolvedValue(false);
    const detector = new MusicDetector({
      name: 'Spotify',
      emoji: ':spotify_2:',
      isAvailable: () => true,
      isRunning,
      getPlayerState: vi.fn(),
      getTrack: vi.fn(),
    });

    await expect(detector.getStatus()).resolves.toEqual({
      name: 'Spotify',
      isActive: false,
    });
    expect(isRunning).toHaveBeenCalledOnce();
  });

  it('returns active status when playback is running and a track is available', async () => {
    const detector = new MusicDetector({
      name: 'Spotify',
      emoji: ':spotify_2:',
      isAvailable: () => true,
      isRunning: vi.fn().mockResolvedValue(true),
      getPlayerState: vi.fn().mockResolvedValue('playing'),
      getTrack: vi.fn().mockResolvedValue('Artist - Song'),
    });

    await expect(detector.getStatus()).resolves.toEqual({
      name: 'Spotify',
      isActive: true,
      title: 'Artist - Song',
      emoji: ':spotify_2:',
      message: 'Artist - Song',
    });
  });

  it('falls back to inactive when playback is paused', async () => {
    const detector = new MusicDetector({
      name: 'Spotify',
      emoji: ':spotify_2:',
      isAvailable: () => true,
      isRunning: vi.fn().mockResolvedValue(true),
      getPlayerState: vi.fn().mockResolvedValue('paused'),
      getTrack: vi.fn(),
    });

    await expect(detector.getStatus()).resolves.toEqual({
      name: 'Spotify',
      isActive: false,
    });
  });

  it('falls back to inactive when a probe throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const detector = new MusicDetector({
      name: 'Spotify',
      emoji: ':spotify_2:',
      isAvailable: () => true,
      isRunning: vi.fn().mockResolvedValue(true),
      getPlayerState: vi.fn().mockRejectedValue(new Error('boom')),
      getTrack: vi.fn(),
    });

    await expect(detector.getStatus()).resolves.toEqual({
      name: 'Spotify',
      isActive: false,
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('supports music sources that do not need a separate running probe', async () => {
    const detector = new MusicDetector({
      name: 'Apple Music',
      emoji: ':apple_music:',
      isAvailable: () => true,
      getPlayerState: vi.fn().mockResolvedValue('playing'),
      getTrack: vi.fn().mockResolvedValue('Artist - Song'),
    });

    await expect(detector.getStatus()).resolves.toEqual({
      name: 'Apple Music',
      isActive: true,
      title: 'Artist - Song',
      emoji: ':apple_music:',
      message: 'Artist - Song',
    });
  });
});
