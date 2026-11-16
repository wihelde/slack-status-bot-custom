import { z } from 'zod';
import { reportParseFailure, recoverProbe } from './probeContext';
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
  const output = await readCommandOutput(buildNowPlayingCommand(), runner, { step: 'now_playing', recover: false });
  if (!output) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(output);
    if (value === null) return null;
    const info = z.object({ app: z.string().nullish(), title: z.string().nullish(), artist: z.string().nullish(),
      album: z.string().nullish(), playbackRate: z.number().nullish() }).parse(value);
    recoverProbe('now_playing');
    recoverProbe('now_playing.parse');
    return { app: info.app ?? null, title: info.title ?? null, artist: info.artist ?? null,
      album: info.album ?? null, playbackRate: info.playbackRate ?? null };
  } catch {
    // JSON/parser errors can echo music metadata; retain the fixed failed step only.
    reportParseFailure('now_playing.parse');
    return null;
  }
}
