import { CommandRunner, readCommandOutput, runCommand } from './commandProbe';

export interface MacNowPlayingInfo {
  app: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  playbackRate: number | null;
}

const NOW_PLAYING_SCRIPT = `function run() {
  ObjC.import("Foundation");
  const framework = $.NSBundle.bundleWithPath("/System/Library/PrivateFrameworks/MediaRemote.framework/");
  framework.load;
  const request = $.NSClassFromString("MRNowPlayingRequest");
  const item = request.localNowPlayingItem;
  const player = request.localNowPlayingPlayerPath;
  if (!item || !player) return "null";
  const info = item.nowPlayingInfo;
  if (!info) return "null";
  function value(key) {
    const result = info.valueForKey(key);
    return result ? ObjC.unwrap(result) : null;
  }
  return JSON.stringify({
    app: ObjC.unwrap(player.client.displayName),
    title: value("kMRMediaRemoteNowPlayingInfoTitle"),
    artist: value("kMRMediaRemoteNowPlayingInfoArtist"),
    album: value("kMRMediaRemoteNowPlayingInfoAlbum"),
    playbackRate: value("kMRMediaRemoteNowPlayingInfoPlaybackRate")
  });
}`;

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildNowPlayingCommand(): string {
  return `osascript -l JavaScript -e ${shellQuote(NOW_PLAYING_SCRIPT)}`;
}

export async function getMacNowPlayingInfo(
  runner: CommandRunner = runCommand
): Promise<MacNowPlayingInfo | null> {
  const output = await readCommandOutput(buildNowPlayingCommand(), runner);
  if (!output) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(output);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const record = value as Record<string, unknown>;
    return {
      app: typeof record.app === 'string' ? record.app : null,
      title: typeof record.title === 'string' ? record.title : null,
      artist: typeof record.artist === 'string' ? record.artist : null,
      album: typeof record.album === 'string' ? record.album : null,
      playbackRate: typeof record.playbackRate === 'number' ? record.playbackRate : null,
    };
  } catch {
    return null;
  }
}
