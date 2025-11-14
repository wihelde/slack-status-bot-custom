import { exec } from 'child_process';
import { promisify } from 'util';
import { ISourceAdapter, SourceStatus } from './sourceAdapter';
import { STATUS_MESSAGES } from '../../config/statusConfig';

const execAsync = promisify(exec);

/**
 * Meeting Detection Adapters
 * Detects Zoom, Teams, and Slack Huddle meetings
 */

/**
 * Zoom Meeting Detector
 */
export class ZoomAdapter implements ISourceAdapter {
  private enabled: boolean = true;

  async getStatus(): Promise<SourceStatus> {
    if (!this.enabled) {
      return { name: 'Zoom', isActive: false };
    }

    const isInMeeting = await this.isInMeeting();
    return {
      name: 'Zoom',
      isActive: isInMeeting,
      emoji: STATUS_MESSAGES.ZOOM_EMOJI,
      message: isInMeeting ? 'In a meeting - will answer later' : undefined,
    };
  }

  isAvailable(): boolean {
    return true; // Works on all platforms
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private async isInMeeting(): Promise<boolean> {
    try {
      if (process.platform === 'darwin') {
        // macOS: exact regex from bash version with proper escaping for Node.js
        // grep returns exit code 1 if no match found, so we use || true to ignore that
        const { stdout } = await execAsync(
          'lsof -i -P -n 2>&1 | grep zoom | grep UDP | grep -E "([0-9]{1,3})$" || true'
        );
        return !!stdout.trim();
      } else if (process.platform === 'win32') {
        // Windows: check for Zoom process
        const { stdout } = await execAsync('tasklist | findstr Zoom.exe || exit /b 1');
        return !!stdout.trim();
      }
      return false;
    } catch {
      return false;
    }
  }
}

/**
 * Microsoft Teams Meeting Detector
 */
export class TeamsAdapter implements ISourceAdapter {
  private enabled: boolean = true;

  async getStatus(): Promise<SourceStatus> {
    if (!this.enabled) {
      return { name: 'Microsoft Teams', isActive: false };
    }

    const isInMeeting = await this.isInMeeting();
    return {
      name: 'Microsoft Teams',
      isActive: isInMeeting,
      emoji: STATUS_MESSAGES.TEAMS_EMOJI,
      message: isInMeeting ? 'In a meeting - will answer later' : undefined,
    };
  }

  isAvailable(): boolean {
    return true;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private async isInMeeting(): Promise<boolean> {
    try {
      if (process.platform === 'darwin') {
        // macOS: exact regex from bash version with proper escaping for Node.js
        // grep returns exit code 1 if no match found, so we use || true to ignore that
        const { stdout } = await execAsync(
          'lsof -i -P -n 2>&1 | grep MSTeams | grep UDP | grep -E "([0-9]{1,3}[\\\.]){3}[0-9]{1,3}[\\\:](500[0-9]{2})$" || true'
        );
        return !!stdout.trim();
      } else if (process.platform === 'win32') {
        // Windows: check for Teams process
        const { stdout } = await execAsync('tasklist | findstr Teams.exe || exit /b 1');
        return !!stdout.trim();
      }
      return false;
    } catch {
      return false;
    }
  }
}

/**
 * Slack Huddle Detector
 */
export class HuddleAdapter implements ISourceAdapter {
  private enabled: boolean = true;

  async getStatus(): Promise<SourceStatus> {
    if (!this.enabled) {
      return { name: 'Slack Huddle', isActive: false };
    }

    const isInHuddle = await this.isInHuddle();
    return {
      name: 'Slack Huddle',
      isActive: isInHuddle,
      emoji: STATUS_MESSAGES.HUDDLE_EMOJI,
      message: isInHuddle ? 'In a huddle - will answer later' : undefined,
    };
  }

  isAvailable(): boolean {
    return true;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private async isInHuddle(): Promise<boolean> {
    try {
      if (process.platform === 'darwin') {
        // macOS: detect Slack Huddle by finding UDP connections WITHOUT arrows (local ports only)
        // grep returns exit code 1 if no match found, so we use || true to ignore that
        const { stdout } = await execAsync(
          'lsof -i -P -n 2>&1 | grep Slack | grep UDP | grep -v "\\->" || true'
        );
        return !!stdout.trim();
      } else if (process.platform === 'win32') {
        // Windows: check for Slack process with UDP
        const { stdout } = await execAsync('tasklist | findstr slack.exe || exit /b 1');
        return !!stdout.trim();
      }
      return false;
    } catch {
      return false;
    }
  }
}

