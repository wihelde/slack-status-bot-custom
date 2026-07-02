import { DelegatingSourceAdapter } from './sourceAdapter';
import { STATUS_MESSAGES } from '../../config/statusConfig';
import { hasMacUdpConnectionMatch } from './probes/networkProbe';
import { isWindowsProcessRunning } from './probes/processProbe';
import { MeetingDetector } from './detectors/meetingDetector';

/**
 * Meeting Detection Adapters
 * Detects Zoom, Teams, and Slack Huddle meetings
 */

async function isZoomMeetingActive(): Promise<boolean> {
  if (process.platform === 'darwin') {
    return hasMacUdpConnectionMatch('zoom', '([0-9]{1,3})$');
  }

  if (process.platform === 'win32') {
    return isWindowsProcessRunning('Zoom.exe');
  }

  return false;
}

async function isTeamsMeetingActive(): Promise<boolean> {
  if (process.platform === 'darwin') {
    const teamsUdpPattern = '([0-9]{1,3}[.]){3}[0-9]{1,3}[:](500[0-9]{2})$';
    return (
      (await hasMacUdpConnectionMatch('MSTeams', teamsUdpPattern)) ||
      (await hasMacUdpConnectionMatch('Microsoft', teamsUdpPattern))
    );
  }

  if (process.platform === 'win32') {
    return isWindowsProcessRunning('Teams.exe');
  }

  return false;
}

async function isHuddleActive(): Promise<boolean> {
  if (process.platform === 'darwin') {
    return hasMacUdpConnectionMatch('Slack', '([0-9]{5})$');
  }

  if (process.platform === 'win32') {
    return isWindowsProcessRunning('slack.exe');
  }

  return false;
}

/**
 * Zoom Meeting Detector
 */
export class ZoomAdapter extends DelegatingSourceAdapter {
  constructor() {
    const detector = new MeetingDetector({
      name: 'Zoom',
      emoji: STATUS_MESSAGES.ZOOM_EMOJI,
      activeMessage: 'In a meeting - will answer later',
      isAvailable: () => true,
      probe: isZoomMeetingActive,
    });

    super({
      name: 'Zoom',
      isAvailable: () => true,
      getStatus: () => detector.getStatus(),
    });
  }
}

/**
 * Microsoft Teams Meeting Detector
 */
export class TeamsAdapter extends DelegatingSourceAdapter {
  constructor() {
    const detector = new MeetingDetector({
      name: 'Microsoft Teams',
      emoji: STATUS_MESSAGES.TEAMS_EMOJI,
      activeMessage: 'In a meeting - will answer later',
      isAvailable: () => true,
      probe: isTeamsMeetingActive,
    });

    super({
      name: 'Microsoft Teams',
      isAvailable: () => true,
      getStatus: () => detector.getStatus(),
    });
  }
}

/**
 * Slack Huddle Detector
 */
export class HuddleAdapter extends DelegatingSourceAdapter {
  constructor() {
    const detector = new MeetingDetector({
      name: 'Slack Huddle',
      emoji: STATUS_MESSAGES.HUDDLE_EMOJI,
      activeMessage: 'In a huddle - will answer later',
      isAvailable: () => true,
      probe: isHuddleActive,
    });

    super({
      name: 'Slack Huddle',
      isAvailable: () => true,
      getStatus: () => detector.getStatus(),
    });
  }
}
