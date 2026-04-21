import { DelegatingSourceAdapter } from './sourceAdapter';
import { STATUS_MESSAGES } from '../../config/statusConfig';
import { readAppleScriptOutput } from './probes/appleScriptProbe';
import { isMacProcessRunning } from './probes/processProbe';
import { MusicDetector } from './detectors/musicDetector';

const SPOTIFY_PLAYER_STATE_SCRIPT = [
  'try',
  'if application "Spotify" is running then',
  'tell application "Spotify" to player state',
  'end if',
  'end try',
];

const SPOTIFY_TRACK_SCRIPT = [
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
];

function isMacOs(): boolean {
  return process.platform === 'darwin';
}

async function getSpotifyPlayerState(): Promise<string> {
  const playerState = await readAppleScriptOutput(SPOTIFY_PLAYER_STATE_SCRIPT);
  return playerState?.toLowerCase() ?? '';
}

async function getSpotifyTrack(): Promise<string | null> {
  const track = await readAppleScriptOutput(SPOTIFY_TRACK_SCRIPT);
  if (!track) {
    return null;
  }

  if (track.length > 100) {
    return track.substring(0, 97) + '...';
  }

  return track;
}

/**
 * Spotify Source Adapter
 * Detects Spotify playback and extracts current track info
 * macOS only (uses AppleScript and lsof)
 */
export class SpotifyAdapter extends DelegatingSourceAdapter {
  constructor() {
    const detector = new MusicDetector({
      name: 'Spotify',
      emoji: STATUS_MESSAGES.SPOTIFY_EMOJI,
      isAvailable: isMacOs,
      isRunning: () => isMacProcessRunning('Spotify'),
      getPlayerState: getSpotifyPlayerState,
      getTrack: getSpotifyTrack,
    });

    super({
      name: 'Spotify',
      isAvailable: isMacOs,
      getStatus: () => detector.getStatus(),
    });
  }
}
