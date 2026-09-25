import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import axios from 'axios';
import { SlackStatusBotDaemon } from '../../daemon';
import { STATUS_MESSAGES } from '../../config/statusConfig';

vi.mock('axios');

describe('Shared Status delivery across Workspace Connections', () => {
  let directory: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'slack-delivery-'));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('sends a manual profile update to B even when A throws, without claiming full success', async () => {
    const sentTo: string[] = [];
    const post = vi.fn(async (url: string, _body: unknown, options: { headers: { Authorization: string } }) => {
      const token = options.headers.Authorization;
      if (url === '/users.profile.set') sentTo.push(token);
      if (token === 'Bearer token-a') throw new Error('A is offline');
      return { data: { ok: true } };
    });
    vi.mocked(axios.create).mockReturnValue({ post } as unknown as ReturnType<typeof axios.create>);
    const daemon = new SlackStatusBotDaemon({ slackTokens: ['token-a', 'token-b'], configDir: directory });

    const success = await daemon.setStatus(':coffee:', 'Working');

    expect(sentTo).toEqual(['Bearer token-a', 'Bearer token-b']);
    expect(success).toBe(false);
  });

  it('delivers meeting profile, presence, and DND to B when A is unavailable', async () => {
    const delivered: string[] = [];
    const post = vi.fn(async (url: string, _body: unknown, options: { headers: { Authorization: string } }) => {
      if (options.headers.Authorization === 'Bearer token-a') throw new Error('A is offline');
      delivered.push(url);
      return { data: { ok: true } };
    });
    vi.mocked(axios.create).mockReturnValue({ post } as unknown as ReturnType<typeof axios.create>);
    const daemon = new SlackStatusBotDaemon({ slackTokens: ['token-a', 'token-b'], configDir: directory });

    const success = await daemon.setStatus(STATUS_MESSAGES.MEETING_EMOJI, 'Meeting');
    const workspaces = await daemon.getWorkspaceStatuses();

    expect(delivered).toEqual(['/users.profile.set', '/users.setPresence', '/dnd.setSnooze']);
    expect(success).toBe(false);
    expect(workspaces.map(workspace => workspace.delivery)).toEqual([
      { profile: 'failed', presence: 'failed', dnd: 'failed' },
      { profile: 'delivered', presence: 'delivered', dnd: 'delivered' },
    ]);
  });

  it('uses B as the Reference Workspace when A has no reachable profile', async () => {
    const readFrom: string[] = [];
    const get = vi.fn(async (_url: string, options: { headers: { Authorization: string } }) => {
      readFrom.push(options.headers.Authorization);
      if (options.headers.Authorization === 'Bearer token-a') throw new Error('A is offline');
      return { data: { ok: true, profile: { status_emoji: ':coffee:', status_text: 'Working' } } };
    });
    vi.mocked(axios.create).mockReturnValue({ get } as unknown as ReturnType<typeof axios.create>);
    const daemon = new SlackStatusBotDaemon({ slackTokens: ['token-a', 'token-b'], configDir: directory });

    const status = await daemon.getSlackStatus();

    expect(status).toMatchObject({ emoji: ':coffee:', text: 'Working' });
    expect(readFrom).toContain('Bearer token-b');
  });

  it('reports A as unavailable and B with its own observed profile and delivery result', async () => {
    const post = vi.fn(async (_url: string, _body: unknown, options: { headers: { Authorization: string } }) => {
      if (options.headers.Authorization === 'Bearer token-a') throw new Error('A is offline');
      return { data: { ok: true } };
    });
    const get = vi.fn(async (_url: string, options: { headers: { Authorization: string } }) => {
      if (options.headers.Authorization === 'Bearer token-a') throw new Error('A is offline');
      return { data: { ok: true, profile: { status_emoji: ':coffee:', status_text: 'Working' } } };
    });
    vi.mocked(axios.create).mockReturnValue({ post, get } as unknown as ReturnType<typeof axios.create>);
    const daemon = new SlackStatusBotDaemon({
      slackTokens: ['token-a', 'token-b'], configDir: directory,
      workspaceConnections: [
        { teamId: 'T-A', teamName: 'Alpha', userName: 'Alice' },
        { teamId: 'T-B', teamName: 'Beta', userName: 'Bob' },
      ],
    });
    await daemon.setStatus(':coffee:', 'Working');

    const workspaces = await daemon.getWorkspaceStatuses();

    expect(workspaces).toEqual([
      { teamId: 'T-A', teamName: 'Alpha', userName: 'Alice',
        health: 'unavailable', profile: null, delivery: { profile: 'failed', dnd: 'failed' } },
      { teamId: 'T-B', teamName: 'Beta', userName: 'Bob',
        health: 'reachable', profile: { status_emoji: ':coffee:', status_text: 'Working' },
        delivery: { profile: 'delivered', dnd: 'delivered' } },
    ]);
  });

  it('keeps a partially delivered holiday protected as the shared custom status', async () => {
    const post = vi.fn(async (_url: string, _body: unknown, options: { headers: { Authorization: string } }) =>
      ({ data: { ok: options.headers.Authorization === 'Bearer token-b' } }));
    const get = vi.fn(async (_url: string, options: { headers: { Authorization: string } }) =>
      ({ data: options.headers.Authorization === 'Bearer token-b'
        ? { ok: true, profile: { status_emoji: STATUS_MESSAGES.HOLIDAY_EMOJI, status_text: 'On holiday' } }
        : { ok: false, error: 'not_authed' } }));
    vi.mocked(axios.create).mockReturnValue({ post, get } as unknown as ReturnType<typeof axios.create>);
    const daemon = new SlackStatusBotDaemon({ slackTokens: ['token-a', 'token-b'], configDir: directory });

    const success = await daemon.setStatus(STATUS_MESSAGES.HOLIDAY_EMOJI, 'On holiday');
    const status = await daemon.getSlackStatus();

    expect(success).toBe(false);
    expect(status.stateCheckValue).toBe('not working');
    expect(status.text).toBe('On holiday');
  });

  it('catches up only A to the latest shared profile on the correction cycle', async () => {
    let aAvailable = false;
    const profiles = new Map([
      ['Bearer token-a', { status_emoji: ':old:', status_text: 'Old' }],
      ['Bearer token-b', { status_emoji: ':old:', status_text: 'Old' }],
    ]);
    const posts: string[] = [];
    const post = vi.fn(async (url: string, body: { profile?: { status_emoji: string; status_text: string } },
      options: { headers: { Authorization: string } }) => {
      const token = options.headers.Authorization;
      if (url === '/users.profile.set') {
        posts.push(token);
        if (token === 'Bearer token-a' && !aAvailable) return { data: { ok: false, error: 'service_unavailable' } };
        profiles.set(token, body.profile!);
      }
      return { data: { ok: true } };
    });
    const get = vi.fn(async (_url: string, options: { headers: { Authorization: string } }) =>
      ({ data: { ok: true, profile: profiles.get(options.headers.Authorization) } }));
    vi.mocked(axios.create).mockReturnValue({ post, get } as unknown as ReturnType<typeof axios.create>);
    const onWorkspaceDeliveryChanged = vi.fn();
    const daemon = new SlackStatusBotDaemon({ slackTokens: ['token-a', 'token-b'], configDir: directory,
      onWorkspaceDeliveryChanged });
    await daemon.setStatus(':coffee:', 'Working');
    await daemon.setStatus(':focus:', 'Focus');
    posts.length = 0;
    aAvailable = true;
    expect((await daemon.getSlackStatus()).text).toBe('Focus');

    await daemon.runCorrectionCycle();

    expect(posts).toEqual(['Bearer token-a']);
    expect(onWorkspaceDeliveryChanged).toHaveBeenCalledTimes(1);
    expect((await daemon.getWorkspaceStatuses()).map(workspace => workspace.profile?.status_text)).toEqual(['Focus', 'Focus']);
  });

  it('restores profile, presence and DND intent in A without rewriting B', async () => {
    let aAvailable = false;
    const requests: string[] = [];
    const recoveredDndMinutes: number[] = [];
    const post = vi.fn(async (url: string, body: { num_minutes?: number }, options: { headers: { Authorization: string } }) => {
      requests.push(`${options.headers.Authorization} ${url}`);
      if (aAvailable && url === '/dnd.setSnooze' && options.headers.Authorization === 'Bearer token-a') {
        recoveredDndMinutes.push(body.num_minutes!);
      }
      return { data: { ok: options.headers.Authorization === 'Bearer token-b' || aAvailable } };
    });
    const get = vi.fn(async (_url: string, options: { headers: { Authorization: string } }) =>
      ({ data: { ok: true, profile: { status_emoji: STATUS_MESSAGES.MEETING_EMOJI,
        status_text: options.headers.Authorization === 'Bearer token-b' ? 'Meeting' : 'Old' } } }));
    vi.mocked(axios.create).mockReturnValue({ post, get } as unknown as ReturnType<typeof axios.create>);
    const daemon = new SlackStatusBotDaemon({ slackTokens: ['token-a', 'token-b'], configDir: directory });
    await daemon.setStatus(STATUS_MESSAGES.MEETING_EMOJI, 'Meeting');
    requests.length = 0;
    aAvailable = true;
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 30 * 60_000 + 1000);

    await daemon.runCorrectionCycle();

    expect(requests).toEqual([
      'Bearer token-a /users.profile.set',
      'Bearer token-a /users.setPresence',
      'Bearer token-a /dnd.setSnooze',
    ]);
    expect(recoveredDndMinutes).toEqual([1410]);
  });

  it('catches up a reconnected A immediately using B as the trusted shared reference', async () => {
    const profiles = new Map([
      ['Bearer token-a-new', { status_emoji: ':old:', status_text: 'Old' }],
      ['Bearer token-b', { status_emoji: ':coffee:', status_text: 'Working' }],
    ]);
    const posts: string[] = [];
    const post = vi.fn(async (url: string, body: { profile?: { status_emoji: string; status_text: string } },
      options: { headers: { Authorization: string } }) => {
      if (url === '/users.profile.set') {
        posts.push(options.headers.Authorization);
        profiles.set(options.headers.Authorization, body.profile!);
      }
      return { data: { ok: true } };
    });
    const get = vi.fn(async (_url: string, options: { headers: { Authorization: string } }) =>
      ({ data: { ok: true, profile: profiles.get(options.headers.Authorization) } }));
    vi.mocked(axios.create).mockReturnValue({ post, get } as unknown as ReturnType<typeof axios.create>);
    const daemon = new SlackStatusBotDaemon({
      slackTokens: ['token-b'], configDir: directory,
      workspaceConnections: [{ teamId: 'T-B', teamName: 'Beta', userName: 'Bob' }],
    });
    await daemon.setStatus(':coffee:', 'Working');
    posts.length = 0;

    await daemon.updateConnections(['token-a-new', 'token-b'], [
      { teamId: 'T-A', teamName: 'Alpha', userName: 'Alice' },
      { teamId: 'T-B', teamName: 'Beta', userName: 'Bob' },
    ]);

    expect(posts).toEqual(['Bearer token-a-new']);
    expect((await daemon.getSlackStatus()).text).toBe('Working');
    expect((await daemon.getWorkspaceStatuses())[0].delivery.profile).toBe('delivered');
  });

  it('does not force a new workspace to copy an unrecognized user status', async () => {
    const post = vi.fn().mockResolvedValue({ data: { ok: true } });
    const get = vi.fn(async (_url: string, options: { headers: { Authorization: string } }) => ({ data: {
      ok: true, profile: options.headers.Authorization === 'Bearer token-b'
        ? { status_emoji: ':personal:', status_text: 'My own status' }
        : { status_emoji: ':old:', status_text: 'Old' },
    } }));
    vi.mocked(axios.create).mockReturnValue({ post, get } as unknown as ReturnType<typeof axios.create>);
    const daemon = new SlackStatusBotDaemon({
      slackTokens: ['token-b'], configDir: directory,
      workspaceConnections: [{ teamId: 'T-B', teamName: 'Beta', userName: 'Bob' }],
    });

    await daemon.updateConnections(['token-a', 'token-b'], [
      { teamId: 'T-A', teamName: 'Alpha', userName: 'Alice' },
      { teamId: 'T-B', teamName: 'Beta', userName: 'Bob' },
    ]);

    expect(post).not.toHaveBeenCalled();
    expect((await daemon.getSlackStatus()).text).toBe('My own status');
  });

  it('waits for Slack retry-after before catching up a rate-limited workspace', async () => {
    const start = Date.now();
    const post = vi.fn(async (_url: string, _body: unknown, options: { headers: { Authorization: string } }) =>
      options.headers.Authorization === 'Bearer token-a'
        ? { data: { ok: false, error: 'ratelimited' }, headers: { 'retry-after': '30' } }
        : { data: { ok: true } });
    vi.mocked(axios.create).mockReturnValue({ post } as unknown as ReturnType<typeof axios.create>);
    const daemon = new SlackStatusBotDaemon({ slackTokens: ['token-a', 'token-b'], configDir: directory });
    await daemon.setStatus(':coffee:', 'Working');
    expect(post.mock.calls.filter(call => call[2].headers.Authorization === 'Bearer token-a').map(call => call[0]))
      .toEqual(['/users.profile.set']);
    post.mockClear();

    await daemon.runCorrectionCycle();
    expect(post).not.toHaveBeenCalled();

    vi.spyOn(Date, 'now').mockReturnValue(start + 31_000);
    await daemon.runCorrectionCycle();
    expect(post.mock.calls.some(call => call[2].headers.Authorization === 'Bearer token-a')).toBe(true);
  });

  it('uses a fresh empty reference after holiday expiry instead of replaying the holiday', async () => {
    const profiles = new Map<string, { status_emoji: string; status_text: string; status_expiration?: number }>();
    const posts: Array<{ token: string; profile: { status_emoji: string; status_expiration: number } }> = [];
    const post = vi.fn(async (url: string, body: { profile?: { status_emoji: string; status_text: string;
      status_expiration: number } }, options: { headers: { Authorization: string } }) => {
      if (url === '/users.profile.set') {
        posts.push({ token: options.headers.Authorization, profile: body.profile! });
        profiles.set(options.headers.Authorization, body.profile!);
      }
      return { data: { ok: true } };
    });
    const get = vi.fn(async (_url: string, options: { headers: { Authorization: string } }) =>
      ({ data: { ok: true, profile: profiles.get(options.headers.Authorization) } }));
    vi.mocked(axios.create).mockReturnValue({ post, get } as unknown as ReturnType<typeof axios.create>);
    const daemon = new SlackStatusBotDaemon({
      slackTokens: ['token-b'], configDir: directory,
      workspaceConnections: [{ teamId: 'T-B', teamName: 'Beta', userName: 'Bob' }],
    });
    await daemon.setHoliday('26.09.2026');
    posts.length = 0;
    profiles.set('Bearer token-b', { status_emoji: '', status_text: '' });
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-09-27T12:00:00Z').getTime());

    await daemon.updateConnections(['token-a', 'token-b'], [
      { teamId: 'T-A', teamName: 'Alpha', userName: 'Alice' },
      { teamId: 'T-B', teamName: 'Beta', userName: 'Bob' },
    ]);

    expect(posts).toEqual([{ token: 'Bearer token-a', profile: {
      status_emoji: '', status_text: '', status_expiration: 0,
    } }]);
  });

  it('also backs off when presence is rate limited', async () => {
    const post = vi.fn(async (url: string, _body: unknown, options: { headers: { Authorization: string } }) =>
      url === '/users.setPresence' && options.headers.Authorization === 'Bearer token-a'
        ? { data: { ok: false, error: 'ratelimited' }, headers: { 'retry-after': '30' } }
        : { data: { ok: true } });
    const get = vi.fn().mockResolvedValue({ data: { ok: true,
      profile: { status_emoji: STATUS_MESSAGES.MEETING_EMOJI, status_text: 'Meeting' } } });
    vi.mocked(axios.create).mockReturnValue({ post, get } as unknown as ReturnType<typeof axios.create>);
    const daemon = new SlackStatusBotDaemon({ slackTokens: ['token-a', 'token-b'], configDir: directory });
    await daemon.setStatus(STATUS_MESSAGES.MEETING_EMOJI, 'Meeting');
    const start = Date.now();
    post.mockClear();

    await daemon.runCorrectionCycle();
    expect(post).not.toHaveBeenCalled();

    vi.spyOn(Date, 'now').mockReturnValue(start + 31_000);
    await daemon.runCorrectionCycle();
    expect(post.mock.calls.map(call => call[0])).toEqual(['/users.setPresence']);
  });

  it('does not copy an old app intent after the reference user chooses a custom status', async () => {
    let current = { status_emoji: ':coffee:', status_text: 'Working' };
    const post = vi.fn().mockResolvedValue({ data: { ok: true } });
    const get = vi.fn(async () => ({ data: { ok: true, profile: current } }));
    vi.mocked(axios.create).mockReturnValue({ post, get } as unknown as ReturnType<typeof axios.create>);
    const daemon = new SlackStatusBotDaemon({
      slackTokens: ['token-b'], configDir: directory,
      workspaceConnections: [{ teamId: 'T-B', teamName: 'Beta', userName: 'Bob' }],
    });
    await daemon.setStatus(':coffee:', 'Working');
    post.mockClear();
    current = { status_emoji: ':personal:', status_text: 'My own status' };

    await daemon.updateConnections(['token-a', 'token-b'], [
      { teamId: 'T-A', teamName: 'Alpha', userName: 'Alice' },
      { teamId: 'T-B', teamName: 'Beta', userName: 'Bob' },
    ]);

    expect(post).not.toHaveBeenCalled();
  });

  it('catches up an offline workspace to the cleared status after a holiday expires', async () => {
    const profiles = new Map<string, { status_emoji: string; status_text: string; status_expiration?: number }>();
    const posts: Array<{ token: string; emoji: string }> = [];
    const post = vi.fn(async (url: string, body: { profile?: { status_emoji: string; status_text: string;
      status_expiration: number } }, options: { headers: { Authorization: string } }) => {
      if (url === '/users.profile.set') {
        posts.push({ token: options.headers.Authorization, emoji: body.profile!.status_emoji });
        if (options.headers.Authorization === 'Bearer token-a' && body.profile!.status_emoji) {
          return { data: { ok: false, error: 'service_unavailable' } };
        }
        profiles.set(options.headers.Authorization, body.profile!);
      }
      return { data: { ok: true } };
    });
    const get = vi.fn(async (_url: string, options: { headers: { Authorization: string } }) =>
      ({ data: { ok: true, profile: profiles.get(options.headers.Authorization) } }));
    vi.mocked(axios.create).mockReturnValue({ post, get } as unknown as ReturnType<typeof axios.create>);
    const daemon = new SlackStatusBotDaemon({ slackTokens: ['token-a', 'token-b'], configDir: directory });
    await daemon.setHoliday('26.09.2026');
    posts.length = 0;
    profiles.set('Bearer token-b', { status_emoji: '', status_text: '' });
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-09-27T12:00:00Z').getTime());

    await daemon.runCorrectionCycle();

    expect(posts.filter(post => post.token === 'Bearer token-a')).toEqual([{ token: 'Bearer token-a', emoji: '' }]);
  });
});
