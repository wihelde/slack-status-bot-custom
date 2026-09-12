import { STATUS_MESSAGES } from '../../config/statusConfig';
import { DelegatingSourceAdapter, SourceStatus } from './sourceAdapter';
import { getMacNowPlayingInfo } from './probes/nowPlayingProbe';
import { isMacApplicationRunning } from './probes/processProbe';

const SOURCE_NAME = 'YouTube Music';
const METADATA_GAP_GRACE_PERIOD_MS = 1500;

function isMacOs(): boolean {
  return process.platform === 'darwin';
}

function inactiveStatus(): SourceStatus {
  return {
    name: SOURCE_NAME,
    isActive: false,
  };
}

function createYouTubeMusicStatusProbe(): () => Promise<SourceStatus> {
  let lastActiveStatus: SourceStatus | null = null;
  let metadataGapStartedAt: number | null = null;

  return async (): Promise<SourceStatus> => {
    try {
      if (!(await isMacApplicationRunning(SOURCE_NAME))) {
        lastActiveStatus = null;
        metadataGapStartedAt = null;
        return inactiveStatus();
      }

      const nowPlaying = await getMacNowPlayingInfo();
      // macOS briefly removes Now Playing metadata while YouTube Music changes tracks.
      if (!nowPlaying && lastActiveStatus) {
        metadataGapStartedAt ??= Date.now();
        if (Date.now() - metadataGapStartedAt <= METADATA_GAP_GRACE_PERIOD_MS) {
          return lastActiveStatus;
        }
      }

      const title = nowPlaying?.title?.trim();
      if (nowPlaying?.app !== SOURCE_NAME || nowPlaying.playbackRate !== 1 || !title) {
        lastActiveStatus = null;
        metadataGapStartedAt = null;
        return inactiveStatus();
      }

      const artist = nowPlaying.artist?.trim();
      const track = artist ? `${artist} - ${title}` : title;
      const message = track.length > 100 ? `${track.substring(0, 97)}...` : track;

      lastActiveStatus = {
        name: SOURCE_NAME,
        isActive: true,
        title: message,
        emoji: STATUS_MESSAGES.YOUTUBE_MUSIC_EMOJI,
        message,
      };
      metadataGapStartedAt = null;
      return lastActiveStatus;
    } catch (error) {
      console.error(`Error getting ${SOURCE_NAME} status:`, error);
      return inactiveStatus();
    }
  };
}

export class YouTubeMusicAdapter extends DelegatingSourceAdapter {
  constructor() {
    super({
      name: SOURCE_NAME,
      isAvailable: isMacOs,
      getStatus: createYouTubeMusicStatusProbe(),
    });
  }
}
