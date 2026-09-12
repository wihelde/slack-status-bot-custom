import { describe, expect, it, vi } from 'vitest';
import { buildAppleScriptCommand, readAppleScriptOutput } from '../probes/appleScriptProbe';
import { commandHasOutput, readCommandOutput } from '../probes/commandProbe';
import { hasMacUdpConnectionMatch } from '../probes/networkProbe';
import { getMacNowPlayingInfo } from '../probes/nowPlayingProbe';
import { isMacApplicationRunning, isMacProcessRunning, isWindowsProcessRunning } from '../probes/processProbe';

describe('source probe seams', () => {
  it('returns trimmed command output', async () => {
    const output = await readCommandOutput('echo test', async () => ({
      stdout: '  hello world  \n',
      stderr: '',
    }));

    expect(output).toBe('hello world');
  });

  it('falls back to null when a command fails', async () => {
    const output = await readCommandOutput('failing-command', async () => {
      throw new Error('boom');
    });

    expect(output).toBeNull();
  });

  it('maps empty command output to false for activity checks', async () => {
    const hasOutput = await commandHasOutput('echo', async () => ({
      stdout: '   \n',
      stderr: '',
    }));

    expect(hasOutput).toBe(false);
  });

  it('builds AppleScript commands from individual script lines', () => {
    expect(
      buildAppleScriptCommand([
        'try',
        'tell application "Spotify" to player state',
        'end try',
      ])
    ).toBe(
      `osascript -e 'try' -e 'tell application "Spotify" to player state' -e 'end try'`
    );
  });

  it('reads AppleScript output through the shared command seam', async () => {
    const output = await readAppleScriptOutput(['return "playing"'], async command => ({
      stdout: command.includes('osascript') ? 'playing\n' : '',
      stderr: '',
    }));

    expect(output).toBe('playing');
  });

  it('checks macOS process activity through the process probe', async () => {
    const commands: string[] = [];

    const running = await isMacProcessRunning('Spotify', async command => {
      commands.push(command);
      return { stdout: '123\n', stderr: '' };
    });

    expect(running).toBe(true);
    expect(commands).toEqual(['pgrep -x "Spotify"']);
  });

  it('checks macOS application activity through Launch Services', async () => {
    const commands: string[] = [];

    const running = await isMacApplicationRunning('YouTube Music', async command => {
      commands.push(command);
      return { stdout: 'ASN:0x0-0x123\n', stderr: '' };
    });

    expect(running).toBe(true);
    expect(commands).toEqual(['lsappinfo find name="YouTube Music"']);
  });

  it('reads system Now Playing metadata through one JXA command', async () => {
    const commands: string[] = [];

    const info = await getMacNowPlayingInfo(async command => {
      commands.push(command);
      return {
        stdout: JSON.stringify({
          app: 'YouTube Music',
          title: 'Cologne',
          artist: 'beabadoobee',
          album: 'Our Extended Play',
          playbackRate: 1,
        }),
        stderr: '',
      };
    });

    expect(info).toEqual({
      app: 'YouTube Music',
      title: 'Cologne',
      artist: 'beabadoobee',
      album: 'Our Extended Play',
      playbackRate: 1,
    });
    expect(commands).toHaveLength(1);
    expect(commands[0]).toContain('osascript -l JavaScript');
  });

  it('maps malformed Now Playing output to no metadata', async () => {
    const info = await getMacNowPlayingInfo(async () => ({
      stdout: 'not-json',
      stderr: '',
    }));

    expect(info).toBeNull();
  });

  it('checks Windows process activity through the process probe', async () => {
    const commands: string[] = [];

    const running = await isWindowsProcessRunning('Teams.exe', async command => {
      commands.push(command);
      return { stdout: 'Teams.exe\n', stderr: '' };
    });

    expect(running).toBe(true);
    expect(commands).toEqual(['tasklist | findstr Teams.exe || exit /b 1']);
  });

  it('checks macOS UDP matches through the network probe', async () => {
    const commands: string[] = [];

    const detected = await hasMacUdpConnectionMatch('zoom', '([0-9]{1,3})$', async command => {
      commands.push(command);
      return { stdout: 'zoom ... UDP 127.0.0.1:5050\n', stderr: '' };
    });

    expect(detected).toBe(true);
    expect(commands).toEqual([
      `lsof -i -P -n 2>&1 | grep 'zoom' | grep UDP | grep -E '([0-9]{1,3})$' || true`,
    ]);
  });
});
