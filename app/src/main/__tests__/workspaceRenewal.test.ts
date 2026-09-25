import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import axios from 'axios';
import { createAppConfigStore } from '../../config/appConfigStore';
import { SlackService } from '../../services/slack';
import { NativeSlackOAuth, exchangeSlackCode } from '../nativeSlackOAuth';
import { verifySlackToken, WorkspaceConnections } from '../workspaceConnections';

vi.mock('axios');

describe('Workspace Connection renewal', () => {
  let directory: string;
  let now: number;
  const encryption = {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`sealed:${value}`),
    decryptString: (value: Buffer) => value.toString().replace(/^sealed:/, ''),
  };

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'slack-renewal-'));
    now = Date.now();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('renews a workspace before expiry and uses the new token after restart', async () => {
    const requests: URLSearchParams[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith('/oauth.v2.access')) {
        const body = options.body as URLSearchParams;
        requests.push(body);
        return { ok: true, json: async () => body.get('grant_type') === 'refresh_token'
          ? { ok: true, token_type: 'user', access_token: 'token-a-new',
              refresh_token: 'refresh-a-new', expires_in: 43200, team: { id: 'T-A' } }
          : { ok: true, authed_user: { token_type: 'user', access_token: 'token-a-old',
              refresh_token: 'refresh-a-old', expires_in: 43200 } } };
      }
      return { ok: true, json: async () => ({
        ok: true, team_id: 'T-A', team: 'Alpha', user_id: 'U-A', user: 'Alice',
      }) };
    }));
    const config = createAppConfigStore({ configDir: directory });
    const connections = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    let browserUrl = '';
    const oauth = new NativeSlackOAuth({
      connections, exchange: exchangeSlackCode, verify: verifySlackToken,
      openExternal: async url => { browserUrl = url; }, onConnected: () => {}, now: () => now,
    });
    await oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T-A');
    await oauth.handleUrl(`slack-status-bot://oauth?state=${new URL(browserUrl).searchParams.get('state')}&code=initial`);
    now += 11.5 * 60 * 60_000;

    await oauth.renewDue();

    const reloaded = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    expect(reloaded.activeTokens()).toEqual(['token-a-new']);
    expect(requests[1].get('client_id')).toBe('1.1');
    expect(requests[1].get('refresh_token')).toBe('refresh-a-old');
    expect(requests[1].has('client_secret')).toBe(false);
    const post = vi.fn().mockResolvedValue({ data: { ok: true } });
    const get = vi.fn().mockResolvedValue({ data: { ok: true, profile: {
      status_emoji: ':coffee:', status_text: 'Working',
    } } });
    vi.mocked(axios.create).mockReturnValue({ post, get } as unknown as ReturnType<typeof axios.create>);
    expect(await new SlackService(reloaded.activeTokens()).setProfile(':coffee:', 'Working')).toBe(true);
    expect(post.mock.calls.map(call => call[2].headers.Authorization)).toEqual(['Bearer token-a-new']);
    expect(fs.readFileSync(path.join(directory, 'workspace-connections.json'), 'utf8')).not.toContain('refresh-a-new');
  });

  it('makes one renewal request when two runtime cycles overlap for a workspace', async () => {
    const config = createAppConfigStore({ configDir: directory });
    const connections = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    connections.upsertNative({
      accessToken: 'token-a-old', refreshToken: 'refresh-a-old', expiresAt: now + 30 * 60_000,
      clientId: '1.1', identity: { kind: 'valid', teamId: 'T-A', teamName: 'Alpha', userId: 'U-A', userName: 'Alice' },
    });
    let finishRefresh: ((value: object) => void) | undefined;
    const requests: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      requests.push((options.body as URLSearchParams).get('refresh_token') || '');
      return { ok: true, json: () => new Promise(resolve => { finishRefresh = resolve; }) };
    }));
    const oauth = new NativeSlackOAuth({
      connections, exchange: exchangeSlackCode, verify: verifySlackToken,
      openExternal: async () => {}, onConnected: () => {}, now: () => now,
    });

    const first = oauth.renewDue();
    const second = oauth.renewDue();
    await vi.waitFor(() => expect(finishRefresh).toBeDefined());
    expect(requests).toEqual(['refresh-a-old']);
    finishRefresh?.({ ok: true, token_type: 'user', access_token: 'token-a-new',
      refresh_token: 'refresh-a-new', expires_in: 43200 });
    await Promise.all([first, second]);
    expect(connections.activeTokens()).toEqual(['token-a-new']);
  });

  it('marks only the rejected workspace for Reconnect while another workspace renews', async () => {
    const config = createAppConfigStore({ configDir: directory });
    const connections = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    for (const [teamId, clientId, name] of [['T-A', '1.1', 'Alpha'], ['T-B', '2.2', 'Beta']]) {
      connections.upsertNative({
        accessToken: `token-${teamId}-old`, refreshToken: `refresh-${teamId}-old`,
        expiresAt: now + 30 * 60_000, clientId,
        identity: { kind: 'valid', teamId, teamName: name, userId: `U-${teamId}`, userName: 'User' },
      });
    }
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      const body = options.body as URLSearchParams;
      return { ok: true, json: async () => body.get('client_id') === '1.1'
        ? { ok: false, error: 'invalid_refresh_token' }
        : { ok: true, token_type: 'user', access_token: 'token-T-B-new',
            refresh_token: 'refresh-T-B-new', expires_in: 43200, team: { id: 'T-B' } } };
    }));
    const notifications: string[] = [];
    const oauth = new NativeSlackOAuth({
      connections, exchange: exchangeSlackCode, verify: verifySlackToken,
      openExternal: async () => {}, onConnected: () => {}, now: () => now,
      onReconnectRequired: teamId => { notifications.push(teamId); },
    });

    await oauth.renewDue();

    expect(connections.list().map(({ teamId, state }) => ({ teamId, state }))).toEqual([
      { teamId: 'T-A', state: 'auth-required' },
      { teamId: 'T-B', state: 'connected' },
    ]);
    expect(connections.activeTokens()).toEqual(['token-T-B-new']);
    expect(notifications).toEqual(['T-A']);
  });

  it('waits for Slack Retry-After before retrying a rate-limited renewal', async () => {
    const config = createAppConfigStore({ configDir: directory });
    const connections = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    connections.upsertNative({
      accessToken: 'token-a-old', refreshToken: 'refresh-a-old', expiresAt: now + 30 * 60_000,
      clientId: '1.1', identity: { kind: 'valid', teamId: 'T-A', teamName: 'Alpha', userId: 'U-A', userName: 'Alice' },
    });
    let requests = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      requests++;
      return requests === 1
        ? { ok: false, status: 429, headers: { get: () => '120' } }
        : { ok: true, json: async () => ({ ok: true, token_type: 'user', access_token: 'token-a-new',
            refresh_token: 'refresh-a-new', expires_in: 43200 }) };
    }));
    const oauth = new NativeSlackOAuth({
      connections, exchange: exchangeSlackCode, verify: verifySlackToken,
      openExternal: async () => {}, onConnected: () => {}, now: () => now,
    });

    await oauth.renewDue();
    const reloaded = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    const restarted = new NativeSlackOAuth({
      connections: reloaded, exchange: exchangeSlackCode, verify: verifySlackToken,
      openExternal: async () => {}, onConnected: () => {}, now: () => now,
    });
    now += 60_000;
    await restarted.renewDue();
    expect(requests).toBe(1);
    now += 60_000;
    await restarted.renewDue();
    expect(reloaded.activeTokens()).toEqual(['token-a-new']);
  });

  it('reports a temporary renewal failure without requesting Reconnect or using an expired token', async () => {
    const config = createAppConfigStore({ configDir: directory });
    const connections = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    connections.upsertNative({
      accessToken: 'token-a-old', refreshToken: 'refresh-a-old', expiresAt: now + 30 * 60_000,
      clientId: '1.1', identity: { kind: 'valid', teamId: 'T-A', teamName: 'Alpha', userId: 'U-A', userName: 'Alice' },
    });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network unavailable: refresh-a-old'); }));
    const notifications: string[] = [];
    const runtimeTokens: string[][] = [];
    const oauth = new NativeSlackOAuth({
      connections, exchange: exchangeSlackCode, verify: verifySlackToken,
      openExternal: async () => {}, onConnected: () => { runtimeTokens.push(connections.activeTokens(now)); }, now: () => now,
      onReconnectRequired: teamId => { notifications.push(teamId); },
    });

    await oauth.renewDue();

    expect(connections.list()[0]).toMatchObject({ teamId: 'T-A', state: 'connected', refreshIssue: 'temporary' });
    expect(connections.activeTokens(now)).toEqual(['token-a-old']);
    now += 31 * 60_000;
    expect(connections.activeTokens(now)).toEqual([]);
    await oauth.renewDue();
    expect(runtimeTokens).toEqual([['token-a-old'], []]);
    expect(notifications).toEqual([]);
  });

  it('notifies once per lost authorization across restart and again after a successful Reconnect', async () => {
    const config = createAppConfigStore({ configDir: directory });
    const connections = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    connections.upsertNative({
      accessToken: 'token-a-old', refreshToken: 'refresh-a-old', expiresAt: now + 30 * 60_000,
      clientId: '1.1', identity: { kind: 'valid', teamId: 'T-A', teamName: 'Alpha', userId: 'U-A', userName: 'Alice' },
    });
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith('/auth.test')) return { ok: true, json: async () => ({
        ok: true, team_id: 'T-A', team: 'Alpha', user_id: 'U-A', user: 'Alice',
      }) };
      const body = options.body as URLSearchParams;
      return { ok: true, json: async () => body.get('grant_type') === 'refresh_token'
        ? { ok: false, error: 'invalid_refresh_token' }
        : { ok: true, authed_user: { token_type: 'user', access_token: 'token-a-reconnected',
            refresh_token: 'refresh-a-reconnected', expires_in: 43200 } } };
    }));
    const notifications: string[] = [];
    let browserUrl = '';
    const createOAuth = (store: WorkspaceConnections) => new NativeSlackOAuth({
      connections: store, exchange: exchangeSlackCode, verify: verifySlackToken,
      openExternal: async url => { browserUrl = url; }, onConnected: () => {}, now: () => now,
      onReconnectRequired: teamId => { notifications.push(teamId); },
    });
    await createOAuth(connections).renewDue();
    const reloaded = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    const restarted = createOAuth(reloaded);
    await restarted.renewDue();
    expect(notifications).toEqual(['T-A']);

    await restarted.reconnect('T-A');
    await restarted.handleUrl(`slack-status-bot://oauth?state=${new URL(browserUrl).searchParams.get('state')}&code=reconnect`);
    expect(reloaded.list()[0].state).toBe('connected');
    now += 11.5 * 60 * 60_000;
    await restarted.renewDue();
    expect(notifications).toEqual(['T-A', 'T-A']);
  });

  it('publishes simultaneous workspace rotations together to the running status service', async () => {
    const config = createAppConfigStore({ configDir: directory });
    const connections = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    for (const teamId of ['T-A', 'T-B']) connections.upsertNative({
      accessToken: `token-${teamId}-old`, refreshToken: `refresh-${teamId}-old`,
      expiresAt: now + 30 * 60_000, clientId: teamId === 'T-A' ? '1.1' : '2.2',
      identity: { kind: 'valid', teamId, teamName: teamId, userId: 'U', userName: 'User' },
    });
    let finishB: ((value: object) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, options: RequestInit) => {
      const teamId = (options.body as URLSearchParams).get('client_id') === '1.1' ? 'T-A' : 'T-B';
      return { ok: true, json: () => teamId === 'T-B'
        ? new Promise(resolve => { finishB = resolve; })
        : Promise.resolve({ ok: true, token_type: 'user', access_token: 'token-T-A-new',
            refresh_token: 'refresh-T-A-new', expires_in: 43200 }) };
    }));
    const activeDuringRestart: string[][] = [];
    const oauth = new NativeSlackOAuth({
      connections, exchange: exchangeSlackCode, verify: verifySlackToken,
      openExternal: async () => {}, onConnected: () => { activeDuringRestart.push(connections.activeTokens()); },
      now: () => now,
    });

    const renewal = oauth.renewDue();
    await vi.waitFor(() => expect(finishB).toBeDefined());
    finishB?.({ ok: true, token_type: 'user', access_token: 'token-T-B-new',
      refresh_token: 'refresh-T-B-new', expires_in: 43200 });
    await renewal;

    expect(activeDuringRestart).toEqual([['token-T-A-new', 'token-T-B-new']]);
  });

  it('does not overwrite a newer Reconnect when an earlier renewal finishes late', async () => {
    const config = createAppConfigStore({ configDir: directory });
    const connections = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    connections.upsertNative({
      accessToken: 'token-a-old', refreshToken: 'refresh-a-old', expiresAt: now + 30 * 60_000,
      clientId: '1.1', identity: { kind: 'valid', teamId: 'T-A', teamName: 'Alpha', userId: 'U-A', userName: 'Alice' },
    });
    connections.upsertNative({
      accessToken: 'token-b', refreshToken: 'refresh-b', expiresAt: now + 12 * 60 * 60_000,
      clientId: '2.2', identity: { kind: 'valid', teamId: 'T-B', teamName: 'Beta', userId: 'U-B', userName: 'Bob' },
    });
    let finishRefresh: ((value: object) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith('/auth.test')) return { ok: true, json: async () => ({
        ok: true, team_id: 'T-A', team: 'Alpha', user_id: 'U-A', user: 'Alice',
      }) };
      const body = options.body as URLSearchParams;
      return { ok: true, json: () => body.get('grant_type') === 'refresh_token'
        ? new Promise(resolve => { finishRefresh = resolve; })
        : Promise.resolve({ ok: true, authed_user: { token_type: 'user', access_token: 'token-a-old',
            refresh_token: 'refresh-a-reconnected', expires_in: 43200 } }) };
    }));
    let browserUrl = '';
    const oauth = new NativeSlackOAuth({
      connections, exchange: exchangeSlackCode, verify: verifySlackToken,
      openExternal: async url => { browserUrl = url; }, onConnected: () => {}, now: () => now,
    });

    const renewal = oauth.renewDue();
    await vi.waitFor(() => expect(finishRefresh).toBeDefined());
    await oauth.reconnect('T-A');
    await oauth.handleUrl(`slack-status-bot://oauth?state=${new URL(browserUrl).searchParams.get('state')}&code=new`);
    finishRefresh?.({ ok: true, token_type: 'user', access_token: 'token-a-late',
      refresh_token: 'refresh-a-late', expires_in: 43200 });
    await renewal;

    const reloaded = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    expect(reloaded.activeTokens()).toEqual(['token-a-old', 'token-b']);
  });

  it('does not recreate a removed workspace when its renewal finishes late', async () => {
    const config = createAppConfigStore({ configDir: directory });
    const connections = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    connections.upsertNative({
      accessToken: 'token-a-old', refreshToken: 'refresh-a-old', expiresAt: now + 30 * 60_000,
      clientId: '1.1', identity: { kind: 'valid', teamId: 'T-A', teamName: 'Alpha', userId: 'U-A', userName: 'Alice' },
    });
    let finishRefresh: ((value: object) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true,
      json: () => new Promise(resolve => { finishRefresh = resolve; }),
    })));
    const oauth = new NativeSlackOAuth({
      connections, exchange: exchangeSlackCode, verify: verifySlackToken,
      openExternal: async () => {}, onConnected: () => {}, now: () => now,
    });

    const renewal = oauth.renewDue();
    await vi.waitFor(() => expect(finishRefresh).toBeDefined());
    expect(oauth.removeWorkspace('T-A')).toBe(true);
    finishRefresh?.({ ok: true, token_type: 'user', access_token: 'token-a-late',
      refresh_token: 'refresh-a-late', expires_in: 43200 });
    await renewal;

    expect(new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken }).list()).toEqual([]);
  });

  it('does not mark a newly authorized connection as lost from an older failed renewal', async () => {
    const config = createAppConfigStore({ configDir: directory });
    const connections = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    const identity = { kind: 'valid' as const, teamId: 'T-A', teamName: 'Alpha', userId: 'U-A', userName: 'Alice' };
    connections.upsertNative({ accessToken: 'token-a', refreshToken: 'refresh-old',
      expiresAt: now + 30 * 60_000, clientId: '1.1', identity });
    let finishRefresh: ((value: object) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true,
      json: () => new Promise(resolve => { finishRefresh = resolve; }),
    })));
    const notifications: string[] = [];
    const oauth = new NativeSlackOAuth({
      connections, exchange: exchangeSlackCode, verify: verifySlackToken,
      openExternal: async () => {}, onConnected: () => {}, now: () => now,
      onReconnectRequired: teamId => { notifications.push(teamId); },
    });

    const renewal = oauth.renewDue();
    await vi.waitFor(() => expect(finishRefresh).toBeDefined());
    connections.upsertNative({ accessToken: 'token-a', refreshToken: 'refresh-new',
      expiresAt: now + 12 * 60 * 60_000, clientId: '1.1', identity });
    finishRefresh?.({ ok: false, error: 'invalid_refresh_token' });
    await renewal;

    expect(connections.list()[0].state).toBe('connected');
    expect(notifications).toEqual([]);
  });
});
