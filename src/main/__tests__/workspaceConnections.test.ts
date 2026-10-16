import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import axios from 'axios';
import { createAppConfigStore } from '../../config/appConfigStore';
import { SlackService } from '../../services/slack';
import { verifySlackToken, WorkspaceConnections } from '../workspaceConnections';

vi.mock('axios');

describe('Workspace Connections migration', () => {
  let directory: string;
  const encrypted = {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`sealed:${value}`),
    decryptString: (value: Buffer) => value.toString().replace(/^sealed:/, ''),
  };

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'slack-workspaces-'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function stubSlackAuth(responseFor: (token: string) => object | Promise<object>) {
    const requested: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      const token = (options.headers as Record<string, string>).Authorization.slice(7);
      requested.push(token);
      return { ok: true, json: async () => responseFor(token) };
    }));
    return requested;
  }

  it('migrates two legacy tokens without losing status access or keeping plaintext', async () => {
    const config = createAppConfigStore({ configDir: directory });
    config.updateSlackTokens(['token-a', 'token-b']);
    config.updateLogLevel('INFO');
    stubSlackAuth(token => token === 'token-a'
      ? { ok: true, team_id: 'T-A', team: 'Alpha', user_id: 'U-A', user: 'Alice' }
      : { ok: true, team_id: 'T-B', team: 'Beta', user_id: 'U-B', user: 'Bob' });

    const store = new WorkspaceConnections({ directory, config, encryption: encrypted, verify: verifySlackToken });
    await store.migrate();

    expect(store.activeTokens()).toEqual(['token-a', 'token-b']);
    expect(store.list()).toMatchObject([
      { teamId: 'T-A', teamName: 'Alpha', userId: 'U-A', state: 'connected' },
      { teamId: 'T-B', teamName: 'Beta', userId: 'U-B', state: 'connected' },
    ]);
    expect(config.load().slackTokens).toEqual([]);
    expect(config.load().logLevel).toBe('INFO');
    expect(fs.readFileSync(path.join(directory, 'workspace-connections.json'), 'utf8')).not.toContain('token-a');
    expect(new WorkspaceConnections({ directory, config, encryption: encrypted, verify: verifySlackToken }).activeTokens())
      .toEqual(['token-a', 'token-b']);

    const post = vi.fn().mockResolvedValue({ data: { ok: true } });
    const get = vi.fn().mockResolvedValue({ data: {
      ok: true, profile: { status_emoji: ':coffee:', status_text: 'Working' },
    } });
    vi.mocked(axios.create).mockReturnValue({ post, get } as unknown as ReturnType<typeof axios.create>);
    const service = new SlackService(store.activeTokens());
    const applied = await service.setProfile(':coffee:', 'Working');
    expect(applied).toBe(true);
    expect(post.mock.calls.map(call => call[2].headers.Authorization))
      .toEqual(['Bearer token-a', 'Bearer token-b']);
  });

  it('keeps the first valid workspace token and retains unverified tokens for retry', async () => {
    const config = createAppConfigStore({ configDir: directory });
    config.updateSlackTokens(['early', 'duplicate', 'offline']);
    stubSlackAuth(token => token === 'offline'
      ? { ok: false, error: 'service_unavailable' }
      : { ok: true, team_id: 'T-A', team: 'Alpha', user_id: token, user: token });
    const store = new WorkspaceConnections({ directory, config, encryption: encrypted, verify: verifySlackToken });

    await store.migrate();

    expect(store.activeTokens()).toEqual(['early', 'offline']);
    expect(store.activeWorkspaceConnections()).toEqual([
      { token: 'early', teamId: 'T-A', teamName: 'Alpha', userName: 'early' },
      { token: 'offline', teamId: null, teamName: null, userName: null },
    ]);
    expect(store.list()).toMatchObject([
      { teamId: 'T-A', state: 'connected' },
      { teamId: null, state: 'unverified' },
    ]);
    expect(JSON.parse(fs.readFileSync(path.join(directory, 'workspace-connections.json'), 'utf8')))
      .toHaveLength(2);
    expect(config.load().slackTokens).toEqual([]);
  });

  it('does not erase plaintext tokens when secure storage is unavailable', async () => {
    const config = createAppConfigStore({ configDir: directory });
    config.updateSlackTokens(['existing']);
    const store = new WorkspaceConnections({
      directory, config, encryption: { ...encrypted, isEncryptionAvailable: () => false },
      verify: verifySlackToken,
    });

    await expect(store.migrate()).rejects.toThrow('Secure storage unavailable');
    expect(config.load().slackTokens).toEqual(['existing']);
  });

  it('replaces only the matching workspace when a new manual token is verified', async () => {
    const config = createAppConfigStore({ configDir: directory });
    config.updateSlackTokens(['old-a', 'token-b']);
    stubSlackAuth(token => ({
      ok: true, team_id: token === 'token-b' ? 'T-B' : 'T-A',
      team: token === 'token-b' ? 'Beta' : 'Alpha', user_id: token, user: token,
    }));
    const store = new WorkspaceConnections({ directory, config, encryption: encrypted, verify: verifySlackToken });
    await store.migrate();

    await store.addTokens(['new-a']);

    expect(store.activeTokens()).toEqual(['new-a', 'token-b']);
    expect(store.list()).toMatchObject([
      { teamId: 'T-A', userId: 'new-a' },
      { teamId: 'T-B', userId: 'token-b' },
    ]);
  });

  it('keeps existing workspaces active while a replacement token cannot be verified', async () => {
    const config = createAppConfigStore({ configDir: directory });
    config.updateSlackTokens(['old-a', 'token-b']);
    stubSlackAuth(token => token === 'new-a'
      ? { ok: false, error: 'service_unavailable' }
      : { ok: true, team_id: token === 'token-b' ? 'T-B' : 'T-A',
          team: token === 'token-b' ? 'Beta' : 'Alpha', user_id: 'U', user: 'User' });
    const store = new WorkspaceConnections({
      directory, config, encryption: encrypted, verify: verifySlackToken,
    });
    await store.migrate();

    await store.addTokens(['new-a']);

    expect(store.activeTokens()).toEqual(['old-a', 'token-b']);
    expect(store.list().at(-1)).toMatchObject({ teamId: null, state: 'unverified' });
  });

  it('can resume migration after encrypted data was written but before plaintext was removed', async () => {
    const config = createAppConfigStore({ configDir: directory });
    config.updateSlackTokens(['token-a']);
    stubSlackAuth(() => ({ ok: true, team_id: 'T-A', team: 'Alpha', user_id: 'U-A', user: 'Alice' }));
    const first = new WorkspaceConnections({ directory, config, encryption: encrypted, verify: verifySlackToken });
    await first.migrate();
    // Recreate the possible post-crash state through the public config API.
    config.updateSlackTokens(['token-a']);
    const resumed = new WorkspaceConnections({ directory, config, encryption: encrypted, verify: verifySlackToken });
    await resumed.migrate();

    expect(resumed.activeTokens()).toEqual(['token-a']);
    expect(config.load().slackTokens).toEqual([]);
  });

  it('does not clear legacy tokens if existing encrypted data cannot be decrypted', async () => {
    const config = createAppConfigStore({ configDir: directory });
    config.updateSlackTokens(['still-working']);
    fs.writeFileSync(path.join(directory, 'workspace-connections.json'), JSON.stringify([{
      fingerprint: 'old', encryptedToken: 'broken', teamId: 'T-A', teamName: 'Alpha',
      userId: 'U-A', userName: 'Alice', state: 'connected',
    }]));
    const encryption = { ...encrypted, decryptString: () => { throw new Error('key unavailable'); } };
    const store = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });

    await expect(store.migrate()).rejects.toThrow('key unavailable');
    expect(config.load().slackTokens).toEqual(['still-working']);
  });

  it('shows invalid legacy credentials without using them for status updates', async () => {
    const config = createAppConfigStore({ configDir: directory });
    config.updateSlackTokens(['invalid', 'valid']);
    stubSlackAuth(token => token === 'invalid'
      ? { ok: false, error: 'invalid_auth' }
      : { ok: true, team_id: 'T-B', team: 'Beta', user_id: 'U-B', user: 'Bob' });
    const store = new WorkspaceConnections({ directory, config, encryption: encrypted, verify: verifySlackToken });

    await store.migrate();

    expect(store.list()).toMatchObject([
      { teamId: null, state: 'invalid' },
      { teamId: 'T-B', state: 'connected' },
    ]);
    expect(store.activeTokens()).toEqual(['valid']);
  });

  it('checks workspaces concurrently so an offline token does not delay every startup check', async () => {
    const config = createAppConfigStore({ configDir: directory });
    config.updateSlackTokens(['token-a', 'token-b']);
    const complete: Array<() => void> = [];
    const requested = stubSlackAuth(() => new Promise(resolve => {
      complete.push(() => resolve({ ok: false, error: 'service_unavailable' }));
    }));
    const store = new WorkspaceConnections({ directory, config, encryption: encrypted, verify: verifySlackToken });

    const migration = store.migrate();
    await vi.waitFor(() => expect(complete).toHaveLength(2));
    expect(requested).toEqual(['token-a', 'token-b']);
    complete.forEach(resolve => resolve());
    await migration;
  });
});
