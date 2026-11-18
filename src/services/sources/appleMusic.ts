import { DelegatingSourceAdapter } from './sourceAdapter';
import { STATUS_MESSAGES } from '../../config/statusConfig';
import { readAppleScriptOutput } from './probes/appleScriptProbe';
import { MusicDetector } from './detectors/musicDetector';

const APPLE_MUSIC_PLAYER_STATE_SCRIPT = [
  'if application "Music" is running then',
  'tell application "Music" to player state',
  'end if',
];

const APPLE_MUSIC_TRACK_SCRIPT = [
  'if application "Music" is running then',
  'tell application "Music" to artist of current track & " - " & name of current track',
  'end if',
];

function isMacOs(): boolean {
  return process.platform === 'darwin';
}

async function getAppleMusicPlayerState(): Promise<string> {
  const playerState = await readAppleScriptOutput(APPLE_MUSIC_PLAYER_STATE_SCRIPT, undefined, 'player_state');
  return playerState?.toLowerCase() ?? '';
}

async function getAppleMusicTrack(): Promise<string | null> {
  const track = await readAppleScriptOutput(APPLE_MUSIC_TRACK_SCRIPT, undefined, 'track');
  if (!track) {
    return null;
  }

  if (track.length > 100) {
    return track.substring(0, 97) + '...';
  }

  return track;
}

/**
 * Apple Music Source Adapter
 * Detects Apple Music playback and extracts current track info
 * macOS only
 */
export class AppleMusicAdapter extends DelegatingSourceAdapter {
  constructor() {
    const detector = new MusicDetector({
      name: 'Apple Music',
      emoji: STATUS_MESSAGES.APPLE_MUSIC_EMOJI,
      isAvailable: isMacOs,
      getPlayerState: getAppleMusicPlayerState,
      getTrack: getAppleMusicTrack,
    });

    super({
      name: 'Apple Music',
      isAvailable: isMacOs,
      getStatus: () => detector.getStatus(),
    });
  }
}
