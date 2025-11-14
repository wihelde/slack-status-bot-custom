import { exec } from 'child_process';
import { promisify } from 'util';
import { ISourceAdapter, SourceStatus } from './sourceAdapter';
import { STATUS_MESSAGES } from '../../config/statusConfig';

const execAsync = promisify(exec);

/**
 * Spotify Source Adapter
 * Detects Spotify playback and extracts current track info
 * macOS only (uses AppleScript and lsof)
 */
export class SpotifyAdapter implements ISourceAdapter {
  private enabled: boolean = true;
  private lastStatus: SourceStatus = {
    name: 'Spotify',
    isActive: false,
  };

  async getStatus(): Promise<SourceStatus> {
    if (!this.enabled) {
      return {
        name: 'Spotify',
        isActive: false,
      };
    }

    try {
      const isRunning = await this.isSpotifyRunning();
      if (!isRunning) {
        this.lastStatus = { name: 'Spotify', isActive: false };
        return this.lastStatus;
      }

      const playerState = await this.getPlayerState();
      if (playerState !== 'playing') {
        this.lastStatus = { name: 'Spotify', isActive: false };
        return this.lastStatus;
      }

      const track = await this.getCurrentTrack();
      if (!track) {
        this.lastStatus = { name: 'Spotify', isActive: false };
        return this.lastStatus;
      }

      this.lastStatus = {
        name: 'Spotify',
        isActive: true,
        title: track,
        emoji: STATUS_MESSAGES.SPOTIFY_EMOJI,
        message: track,
      };

      return this.lastStatus;
    } catch (error) {
      console.error('Error getting Spotify status:', error);
      return { name: 'Spotify', isActive: false };
    }
  }

  isAvailable(): boolean {
    // Spotify adapter is only available on macOS
    return process.platform === 'darwin';
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // Private helpers

  private async isSpotifyRunning(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('pgrep -x "Spotify"');
      return !!stdout.trim();
    } catch {
      return false;
    }
  }

  private async getPlayerState(): Promise<string> {
    try {
      const { stdout } = await execAsync(`
        osascript -e 'try' \\
          -e 'if application "Spotify" is running then' \\
          -e 'tell application "Spotify" to player state' \\
          -e 'end if' \\
          -e 'end try'
      `);
      return stdout.trim().toLowerCase();
    } catch {
      return '';
    }
  }

  private async getCurrentTrack(): Promise<string | null> {
    try {
      const { stdout } = await execAsync(`
        osascript -e 'try' \\
          -e 'if application "Spotify" is running then' \\
          -e 'tell application "Spotify"' \\
          -e 'set track_artist to artist of current track' \\
          -e 'set track_name to name of current track' \\
          -e 'set podcast to album of current track' \\
          -e 'if track_artist = "" then' \\
          -e 'podcast & " - " & track_name' \\
          -e 'else' \\
          -e 'track_artist & " - " & track_name' \\
          -e 'end if' \\
          -e 'end tell' \\
          -e 'end if' \\
          -e 'end try'
      `);

      let track = stdout.trim();
      if (!track) return null;

      // Truncate to 100 characters
      if (track.length > 100) {
        track = track.substring(0, 97) + '...';
      }

      return track;
    } catch {
      return null;
    }
  }
}



