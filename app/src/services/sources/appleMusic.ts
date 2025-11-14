import { exec } from 'child_process';
import { promisify } from 'util';
import { ISourceAdapter, SourceStatus } from './sourceAdapter';
import { STATUS_MESSAGES } from '../../config/statusConfig';

const execAsync = promisify(exec);

/**
 * Apple Music Source Adapter
 * Detects Apple Music playback and extracts current track info
 * macOS only
 */
export class AppleMusicAdapter implements ISourceAdapter {
  private enabled: boolean = true;
  private lastStatus: SourceStatus = {
    name: 'Apple Music',
    isActive: false,
  };

  async getStatus(): Promise<SourceStatus> {
    if (!this.enabled) {
      return {
        name: 'Apple Music',
        isActive: false,
      };
    }

    try {
      const playerState = await this.getPlayerState();
      if (playerState !== 'playing') {
        this.lastStatus = { name: 'Apple Music', isActive: false };
        return this.lastStatus;
      }

      const track = await this.getCurrentTrack();
      if (!track) {
        this.lastStatus = { name: 'Apple Music', isActive: false };
        return this.lastStatus;
      }

      this.lastStatus = {
        name: 'Apple Music',
        isActive: true,
        title: track,
        emoji: STATUS_MESSAGES.APPLE_MUSIC_EMOJI,
        message: track,
      };

      return this.lastStatus;
    } catch (error) {
      console.error('Error getting Apple Music status:', error);
      return { name: 'Apple Music', isActive: false };
    }
  }

  isAvailable(): boolean {
    // Apple Music adapter is only available on macOS
    return process.platform === 'darwin';
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // Private helpers

  private async getPlayerState(): Promise<string> {
    try {
      const { stdout } = await execAsync(`
        osascript -e 'try' \\
          -e 'if application "Music" is running then' \\
          -e 'tell application "Music" to player state' \\
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
          -e 'if application "Music" is running then' \\
          -e 'tell application "Music" to artist of current track & " - " & name of current track' \\
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



