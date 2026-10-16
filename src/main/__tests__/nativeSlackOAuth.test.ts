import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import axios from 'axios';
import { createAppConfigStore } from '../../config/appConfigStore';
import { SlackService } from '../../services/slack';
import { WorkspaceConnections } from '../workspaceConnections';
import { verifySlackToken } from '../workspaceConnections';
import { exchangeSlackCode, NativeSlackOAuth } from '../nativeSlackOAuth';

vi.mock('axios');

describe('native Slack setup', () => {
  let directory: string;
  beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'slack-oauth-')); });
  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function stubSlackHttp({
    exchange,
    identity,
    exchangeTeamId,
  }: {
    exchange: (code: string) => Promise<string> | string;
    identity: (token: string) => object;
    exchangeTeamId?: string;
  }) {
    const exchangedCodes: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith('/oauth.v2.access')) {
        const code = (options.body as URLSearchParams).get('code') || '';
        exchangedCodes.push(code);
        const token = await exchange(code);
        return { ok: true, json: async () => ({
          ok: true, ...(exchangeTeamId ? { team: { id: exchangeTeamId } } : {}), authed_user: {
            token_type: 'user', access_token: token, refresh_token: `refresh-${token}`, expires_in: 43200,
          },
        }) };
      }
      const token = (options.headers as Record<string, string>).Authorization.slice(7);
      return { ok: true, json: async () => identity(token) };
    }));
    return exchangedCodes;
  }

  it('adds B and replaces A without changing B after a callback and restart', async () => {
    const config = createAppConfigStore({ configDir: directory });
    const encryption = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`sealed:${value}`),
      decryptString: (value: Buffer) => value.toString().replace(/^sealed:/, ''),
    };
    const requests: URLSearchParams[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (url.endsWith('/oauth.v2.access')) {
        const form = options.body as URLSearchParams;
        requests.push(form);
        const code = form.get('code');
        const token = code === 'code-2.2' ? 'token-b' : code === 'replace-a' ? 'token-a-new' : 'token-a-old';
        return { ok: true, json: async () => ({
          ok: true, team: { id: token === 'token-b' ? 'T-B' : 'T-A' }, authed_user: {
            token_type: 'user', access_token: token, refresh_token: `refresh-${token}`, expires_in: 43200,
          },
        }) };
      }
      const token = (options.headers as Record<string, string>).Authorization.slice(7);
      return { ok: true, json: async () => ({
        ok: true, team_id: token === 'token-b' ? 'T-B' : 'T-A',
        team: token === 'token-b' ? 'Beta' : 'Alpha',
        user_id: token.endsWith('new') ? 'U-NEW' : 'U-OLD',
        user: token.endsWith('new') ? 'New' : 'Old',
      }) };
    }));
    const connections = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    const opened: string[] = [];
    const oauth = new NativeSlackOAuth({
      connections, verify: verifySlackToken, exchange: exchangeSlackCode,
      openExternal: async url => { opened.push(url); },
      onConnected: vi.fn(),
    });

    for (const [clientId, teamId] of [['1.1', 'T-A'], ['2.2', 'T-B']]) {
      await oauth.handleUrl(`slack-status-bot://connect?client_id=${clientId}&team_id=${teamId}`);
      const state = new URL(opened.at(-1)!).searchParams.get('state');
      const callback = teamId === 'T-B'
        ? `slack-status-bot://oauth/?state=${state}&code=code-${clientId}&team_id=${teamId}`
        : `slack-status-bot://oauth?state=${state}&code=code-${clientId}`;
      await oauth.handleUrl(callback);
    }
    await oauth.reconnect('T-A');
    const replacementState = new URL(opened.at(-1)!).searchParams.get('state');
    await oauth.handleUrl(`slack-status-bot://oauth?state=${replacementState}&code=replace-a`);
    expect(opened.every(value => {
      const url = new URL(value);
      return url.origin === 'https://slack.com' && url.searchParams.has('user_scope') &&
        !url.searchParams.has('scope') && url.searchParams.get('code_challenge_method') === 'S256';
    })).toBe(true);
    expect(connections.activeTokens()).toEqual(['token-a-new', 'token-b']);
    expect(connections.list().map(connection => connection.teamId)).toEqual(['T-A', 'T-B']);
    expect(connections.list().map(connection => connection.userId)).toEqual(['U-NEW', 'U-OLD']);
    const reloaded = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    expect(reloaded.activeTokens()).toEqual(['token-a-new', 'token-b']);
    expect(reloaded.registrationFor('T-A')).toBe('1.1');
    const saved = fs.readFileSync(path.join(directory, 'workspace-connections.json'), 'utf8');
    expect(saved).not.toContain('token-a-new');
    expect(saved).not.toContain('refresh-token-b');
    expect(requests).toHaveLength(3);
    expect(requests.every(form => !form.has('client_secret') && form.has('code_verifier'))).toBe(true);
    const post = vi.fn().mockResolvedValue({ data: { ok: true } });
    const get = vi.fn().mockResolvedValue({ data: {
      ok: true, profile: { status_emoji: ':coffee:', status_text: 'Working' },
    } });
    vi.mocked(axios.create).mockReturnValue({ post, get } as unknown as ReturnType<typeof axios.create>);
    expect(await new SlackService(reloaded.activeTokens()).setProfile(':coffee:', 'Working')).toBe(true);
    expect(post.mock.calls.map(call => call[2].headers.Authorization))
      .toEqual(['Bearer token-a-new', 'Bearer token-b']);
  });

  it('rejects wrong state, cancelled consent, workspace mismatch, and replay without changing connections', async () => {
    const config = createAppConfigStore({ configDir: directory });
    const encryption = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`sealed:${value}`),
      decryptString: (value: Buffer) => value.toString().replace(/^sealed:/, ''),
    };
    const exchangedCodes = stubSlackHttp({
      exchange: () => 'new-b',
      identity: () => ({ ok: true, team_id: 'T-B', team: 'Beta', user_id: 'U-B', user: 'Bob' }),
    });
    const connections = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    await connections.addTokens(['old-b']);
    const opened: string[] = [];
    const messages: string[] = [];
    const oauth = new NativeSlackOAuth({
      connections, verify: verifySlackToken, exchange: exchangeSlackCode,
      openExternal: async url => { opened.push(url); }, onConnected: () => {},
      onResult: message => { messages.push(message); },
    });
    await oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T-A');
    const state = new URL(opened[0]).searchParams.get('state');
    await oauth.handleUrl('slack-status-bot://oauth?state=wrong&code=bad');
    expect(messages.at(-1)).toBe('No matching Slack authorization in this app; reopen the Setup Link');
    await oauth.handleUrl(`slack-status-bot://oauth/unexpected?state=${state}&code=bad`);
    expect(messages.at(-1)).toBe('Unexpected Slack callback URL; authorization unchanged');
    expect(exchangedCodes).toEqual([]);
    await oauth.handleUrl(`slack-status-bot://oauth?state=${state}&code=valid`);
    expect(connections.activeTokens()).toEqual(['old-b']);
    await oauth.handleUrl(`slack-status-bot://oauth?state=${state}&code=replayed`);
    expect(exchangedCodes).toEqual(['valid']);

    await oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T-A');
    const missingCodeState = new URL(opened.at(-1)!).searchParams.get('state');
    await oauth.handleUrl(`slack-status-bot://oauth?state=${missingCodeState}`);
    expect(messages.at(-1)).toBe('Slack did not provide an authorization code; reopen the Setup Link');

    await oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T-A');
    const cancelledState = new URL(opened.at(-1)!).searchParams.get('state');
    await oauth.handleUrl(`slack-status-bot://oauth?state=${cancelledState}&error=access_denied`);
    expect(exchangedCodes).toEqual(['valid']);
    expect(connections.activeTokens()).toEqual(['old-b']);
  });

  it('rejects an expired callback before exchanging its code', async () => {
    const config = createAppConfigStore({ configDir: directory });
    const encryption = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`sealed:${value}`),
      decryptString: (value: Buffer) => value.toString().replace(/^sealed:/, ''),
    };
    const exchangedCodes = stubSlackHttp({
      exchange: () => 'new-a',
      identity: () => ({ ok: true, team_id: 'T-A', team: 'Alpha', user_id: 'U-A', user: 'Alice' }),
    });
    const connections = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    let now = 1000;
    let state = '';
    const oauth = new NativeSlackOAuth({
      connections, exchange: exchangeSlackCode, verify: verifySlackToken, onConnected: () => {}, now: () => now,
      openExternal: async url => { state = new URL(url).searchParams.get('state') || ''; },
    });
    await oauth.handleUrl('slack-status-bot://connect?client_id=1.1');
    now += 10 * 60_000;
    await oauth.handleUrl(`slack-status-bot://oauth?state=${state}&code=expired`);
    expect(exchangedCodes).toEqual([]);
    expect(connections.list()).toEqual([]);
  });

  it('does not connect a workspace when Slack disagrees about the authorized team', async () => {
    const config = createAppConfigStore({ configDir: directory });
    const encryption = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`sealed:${value}`),
      decryptString: (value: Buffer) => value.toString().replace(/^sealed:/, ''),
    };
    stubSlackHttp({
      exchange: () => 'token-b', exchangeTeamId: 'T-A',
      identity: () => ({ ok: true, team_id: 'T-B', team: 'Beta', user_id: 'U-B', user: 'Bob' }),
    });
    const connections = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    let browserUrl = '';
    const oauth = new NativeSlackOAuth({
      connections, exchange: exchangeSlackCode, verify: verifySlackToken,
      openExternal: async url => { browserUrl = url; }, onConnected: () => {},
    });

    await oauth.handleUrl('slack-status-bot://connect?client_id=1.1');
    const state = new URL(browserUrl).searchParams.get('state');
    await oauth.handleUrl(`slack-status-bot://oauth?state=${state}&code=wrong-team`);

    expect(connections.list()).toEqual([]);
  });

  it('keeps simultaneous workspaces and ignores a late superseded authorization', async () => {
    const config = createAppConfigStore({ configDir: directory });
    const encryption = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`sealed:${value}`),
      decryptString: (value: Buffer) => value.toString().replace(/^sealed:/, ''),
    };
    let finishOld: ((token: string) => void) | undefined;
    stubSlackHttp({
      exchange: code => code === 'old'
        ? new Promise(resolve => { finishOld = resolve; })
        : code,
      identity: token => ({
        ok: true, team_id: token.includes('-b') ? 'T-B' : 'T-A',
        team: token.includes('-b') ? 'Beta' : 'Alpha', user_id: 'U', user: 'User',
      }),
    });
    const connections = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    const opened: string[] = [];
    const oauth = new NativeSlackOAuth({
      connections, verify: verifySlackToken, onConnected: () => {},
      openExternal: async url => { opened.push(url); }, exchange: exchangeSlackCode,
    });
    await oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T-A');
    const oldState = new URL(opened[0]).searchParams.get('state');
    const oldCompletion = oauth.handleUrl(`slack-status-bot://oauth?state=${oldState}&code=old`);
    await oauth.handleUrl('slack-status-bot://connect?client_id=2.2&team_id=T-B');
    const bState = new URL(opened[1]).searchParams.get('state');
    await oauth.handleUrl(`slack-status-bot://oauth?state=${bState}&code=token-b`);
    await oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T-A');
    const newState = new URL(opened[2]).searchParams.get('state');
    await oauth.handleUrl(`slack-status-bot://oauth?state=${newState}&code=token-a-new`);
    finishOld?.('token-a-old');
    await oldCompletion;

    expect(connections.activeTokens()).toEqual(['token-b', 'token-a-new']);
  });

  it('removes one workspace locally and keeps the other usable after restart', async () => {
    const config = createAppConfigStore({ configDir: directory });
    const encryption = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`sealed:${value}`),
      decryptString: (value: Buffer) => value.toString().replace(/^sealed:/, ''),
    };
    stubSlackHttp({
      exchange: code => `token-${code}`,
      identity: token => ({
        ok: true, team_id: token.endsWith('a') ? 'T-A' : 'T-B',
        team: token.endsWith('a') ? 'Alpha' : 'Beta', user_id: 'U', user: 'User',
      }),
    });
    const connections = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    const opened: string[] = [];
    const oauth = new NativeSlackOAuth({
      connections, verify: verifySlackToken, exchange: exchangeSlackCode,
      openExternal: async url => { opened.push(url); }, onConnected: () => {},
    });
    for (const [clientId, teamId, code] of [['1.1', 'T-A', 'a'], ['2.2', 'T-B', 'b']]) {
      await oauth.handleUrl(`slack-status-bot://connect?client_id=${clientId}&team_id=${teamId}`);
      const state = new URL(opened.at(-1)!).searchParams.get('state');
      await oauth.handleUrl(`slack-status-bot://oauth?state=${state}&code=${code}`);
    }

    const requestsBeforeRemoval = vi.mocked(fetch).mock.calls.length;
    oauth.removeWorkspace('T-A');
    expect(vi.mocked(fetch).mock.calls).toHaveLength(requestsBeforeRemoval);

    const reloaded = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    expect(reloaded.list().map(connection => connection.teamId)).toEqual(['T-B']);
    expect(reloaded.registrationFor('T-A')).toBeNull();
    const post = vi.fn().mockResolvedValue({ data: { ok: true } });
    const get = vi.fn().mockResolvedValue({ data: {
      ok: true, profile: { status_emoji: ':coffee:', status_text: 'Working' },
    } });
    vi.mocked(axios.create).mockReturnValue({ post, get } as unknown as ReturnType<typeof axios.create>);
    expect(await new SlackService(reloaded.activeTokens()).setProfile(':coffee:', 'Working')).toBe(true);
    expect(post.mock.calls.map(call => call[2].headers.Authorization)).toEqual(['Bearer token-b']);
  });

  it('does not recreate a removed workspace when an earlier authorization finishes late', async () => {
    const config = createAppConfigStore({ configDir: directory });
    const encryption = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`sealed:${value}`),
      decryptString: (value: Buffer) => value.toString().replace(/^sealed:/, ''),
    };
    let finishLate: ((token: string) => void) | undefined;
    stubSlackHttp({
      exchange: code => code === 'late'
        ? new Promise(resolve => { finishLate = resolve; })
        : 'token-a-initial',
      identity: () => ({ ok: true, team_id: 'T-A', team: 'Alpha', user_id: 'U-A', user: 'Alice' }),
    });
    const connections = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    const opened: string[] = [];
    const oauth = new NativeSlackOAuth({
      connections, verify: verifySlackToken, exchange: exchangeSlackCode,
      openExternal: async url => { opened.push(url); }, onConnected: () => {},
    });
    await oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T-A');
    const initialState = new URL(opened.at(-1)!).searchParams.get('state');
    await oauth.handleUrl(`slack-status-bot://oauth?state=${initialState}&code=initial`);
    await oauth.reconnect('T-A');
    const lateState = new URL(opened.at(-1)!).searchParams.get('state');
    const lateCompletion = oauth.handleUrl(`slack-status-bot://oauth?state=${lateState}&code=late`);
    await vi.waitFor(() => expect(finishLate).toBeDefined());

    oauth.removeWorkspace('T-A');
    finishLate?.('token-a-late');
    await lateCompletion;

    const reloaded = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    expect(reloaded.list()).toEqual([]);
    expect(reloaded.activeTokens()).toEqual([]);
  });

  it('rejects a pending reconnect after local removal before exchanging a code', async () => {
    const config = createAppConfigStore({ configDir: directory });
    const encryption = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`sealed:${value}`),
      decryptString: (value: Buffer) => value.toString().replace(/^sealed:/, ''),
    };
    const exchangedCodes = stubSlackHttp({
      exchange: code => `token-${code}`,
      identity: () => ({ ok: true, team_id: 'T-A', team: 'Alpha', user_id: 'U-A', user: 'Alice' }),
    });
    const connections = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    const opened: string[] = [];
    const oauth = new NativeSlackOAuth({
      connections, verify: verifySlackToken, exchange: exchangeSlackCode,
      openExternal: async url => { opened.push(url); }, onConnected: () => {},
    });
    await oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T-A');
    await oauth.handleUrl(`slack-status-bot://oauth?state=${new URL(opened[0]).searchParams.get('state')}&code=initial`);
    await oauth.reconnect('T-A');
    const pendingState = new URL(opened.at(-1)!).searchParams.get('state');
    expect(oauth.removeWorkspace('T-A')).toBe(true);

    await oauth.handleUrl(`slack-status-bot://oauth?state=${pendingState}&code=late`);

    expect(exchangedCodes).toEqual(['initial']);
    expect(connections.list()).toEqual([]);
  });

  it('leaves no connection after removing the final workspace and accepts a new Setup Link', async () => {
    const config = createAppConfigStore({ configDir: directory });
    const encryption = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from(`sealed:${value}`),
      decryptString: (value: Buffer) => value.toString().replace(/^sealed:/, ''),
    };
    stubSlackHttp({
      exchange: code => `token-${code}`,
      identity: token => ({
        ok: true, team_id: token.endsWith('a') ? 'T-A' : 'T-B',
        team: token.endsWith('a') ? 'Alpha' : 'Beta', user_id: 'U', user: 'User',
      }),
    });
    const connections = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    const opened: string[] = [];
    const oauth = new NativeSlackOAuth({
      connections, verify: verifySlackToken, exchange: exchangeSlackCode,
      openExternal: async url => { opened.push(url); }, onConnected: () => {},
    });
    await oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T-A');
    await oauth.handleUrl(`slack-status-bot://oauth?state=${new URL(opened.at(-1)!).searchParams.get('state')}&code=a`);
    expect(oauth.removeWorkspace('T-A')).toBe(true);

    const empty = new WorkspaceConnections({ directory, config, encryption, verify: verifySlackToken });
    expect(empty.list()).toEqual([]);
    expect(empty.activeTokens()).toEqual([]);
    expect(empty.registrationFor('T-A')).toBeNull();

    await oauth.handleUrl('slack-status-bot://connect?client_id=2.2&team_id=T-B');
    await oauth.handleUrl(`slack-status-bot://oauth?state=${new URL(opened.at(-1)!).searchParams.get('state')}&code=b`);
    expect(connections.activeTokens()).toEqual(['token-b']);
  });
});
