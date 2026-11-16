// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import axios from 'axios';
import { exec } from 'node:child_process';
import { SlackStatusBotDaemon } from '../../daemon';
import { createAppConfigStore } from '../../config/appConfigStore';
import { DEFAULT_SOURCE_ORDER, type SourceName } from '../../config/sourceCatalog';
import { createHostTelemetry } from '../telemetry';

vi.mock('axios');
vi.mock('child_process', async () => {
  const { promisify } = await import('node:util');
  const exec = vi.fn();
  Object.defineProperty(exec, promisify.custom, { value: exec, configurable: true });
  return { exec };
});
const originalPlatform = process.platform;
let directory: string;
let telemetry: ReturnType<typeof createHostTelemetry>;
let events: { event: string; properties: Record<string, unknown> }[];
let profile: { status_emoji: string; status_text: string; status_expiration?: number };
let active: boolean;
function createDaemon(broken = false) {
  const post = vi.fn(async (url: string, body: { profile?: typeof profile }, options: { headers: { Authorization: string } }) => {
    const failed = broken && url === '/users.profile.set' && options.headers.Authorization === 'Bearer token-a';
    if (body.profile && !failed) profile = body.profile;
    return { status: 200, headers: {}, data: failed ? { ok: false, error: 'missing_scope', needed: 'users.profile:write' } : { ok: true } };
  });
  const get = vi.fn(async () => ({ data: { ok: true, profile } }));
  vi.mocked(axios.create).mockReturnValue({ post, get } as unknown as ReturnType<typeof axios.create>);
  const daemon = new SlackStatusBotDaemon({ slackTokens: ['token-a', 'token-b'], configDir: directory, telemetry });
  for (const source of DEFAULT_SOURCE_ORDER) daemon.toggleSource(source, source === 'zoom');
  return { daemon, post };
}
beforeEach(() => {
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'automatic-telemetry-'));
  events = [];
  profile = { status_emoji: '', status_text: '' };
  active = true;
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(exec).mockImplementation((async (command: string) => {
    if (command.startsWith('pgrep')) throw Object.assign(new Error('No matching process'), { code: 1, stderr: '' });
    return { stdout: command.startsWith('lsof') && active ? 'zoom UDP 127.0.0.1:5000' : '', stderr: '' };
  }) as unknown as typeof exec);
  telemetry = createHostTelemetry({ configStore: createAppConfigStore({ configDir: directory }),
    configuration: { environment: 'test', host: 'https://posthog.invalid', captureToken: 'phc_fake' },
    appVersion: '2.3.4', fetch: async (_url, init) => {
      events.push(...JSON.parse(String(init.body)).batch);
      return new Response('{}');
    } });
});
afterEach(async () => {
  vi.useRealTimers();
  await telemetry.shutdown();
  vi.restoreAllMocks();
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
  fs.rmSync(directory, { recursive: true, force: true });
});
it('links actual source-driven partial delivery to its winning source, defaults and permission failure', async () => {
  const { daemon } = createDaemon(true);
  const pending = daemon.setSourceOrder(DEFAULT_SOURCE_ORDER);
  await vi.advanceTimersByTimeAsync(2500);
  await pending;
  await telemetry.shutdown();
  const operation = events.find(event => event.event === 'status_operation');
  expect(operation?.properties).toMatchObject({ trigger: 'automatic', source: 'zoom', winner: 'zoom',
    decision: 'reprioritized', enabled_sources: ['zoom'], source_priority: DEFAULT_SOURCE_ORDER,
    active_sources: ['zoom'], meeting_dnd: true, outcome: 'partial', targeted_workspaces: 2, successful_workspaces: 1,
    workspace_results: [{ profile: 'failed', dnd: 'success' }, { profile: 'success', dnd: 'success' }] });
  expect(events.find(event => event.event === '$exception')?.properties).toMatchObject({
    operation_id: operation?.properties.operation_id, code: 'missing_scope', component: 'slack' });
  expect(JSON.stringify(events)).not.toMatch(/token-a|token-b|In a meeting|127\.0\.0\.1/);
});
it('reports a protected source decision as skipped and preserves Holiday and external-command authority', async () => {
  const { daemon, post } = createDaemon();
  const holiday = daemon.setHoliday('30.12.2026');
  await vi.advanceTimersByTimeAsync(2500);
  expect(await holiday).toBe(true);
  const writes = post.mock.calls.length;
  await daemon.setSourceOrder(DEFAULT_SOURCE_ORDER);
  expect(post.mock.calls).toHaveLength(writes);
  await telemetry.shutdown();
  const operations = events.filter(event => event.event === 'status_operation');
  expect(operations.at(-1)?.properties).toMatchObject({ trigger: 'automatic', source: 'zoom', outcome: 'skipped',
    reason: 'protected', rule_reason: 'protected', protected_status: true, targeted_workspaces: 0 });
  expect(events.filter(event => event.event === '$exception')).toHaveLength(0);
  const external = daemon.setExternalStatus(':coffee:', 'Private command');
  await vi.advanceTimersByTimeAsync(2500);
  expect(await external).toBe(true);
  expect(profile.status_text).toBe('Private command');
});
it('keeps unchanged polling quiet and records a real deactivation reset and correction', async () => {
  const { daemon } = createDaemon();
  await daemon.start();
  await vi.advanceTimersByTimeAsync(7000);
  const countBefore = events.filter(event => event.event === 'status_operation').length;
  await vi.advanceTimersByTimeAsync(20_000);
  expect(events.filter(event => event.event === 'status_operation')).toHaveLength(countBefore);
  active = false;
  await vi.advanceTimersByTimeAsync(5000);
  await daemon.stop();
  // A stale managed source after restart needs a genuine correction, even with no active source.
  profile = { status_emoji: ':spotify_2:', status_text: 'Private old track' };
  const { daemon: restarted } = createDaemon();
  const correcting = restarted.runCorrectionCycle();
  await vi.advanceTimersByTimeAsync(2500);
  await correcting;
  await telemetry.shutdown();
  const operations = events.filter(event => event.event === 'status_operation');
  expect(operations.some(event => event.properties.decision === 'deactivated' && event.properties.outcome === 'success')).toBe(true);
  expect(operations.at(-1)?.properties).toMatchObject({ trigger: 'correction', decision: 'correction',
    correction_reason: 'stale-source-status', source: 'spotify', outcome: 'success' });
  expect(events.filter(event => event.event === '$exception')).toHaveLength(0);
});
it('records enabled configuration separately from used sources, including unchanged defaults', async () => {
  const { daemon } = createDaemon();
  daemon.toggleSource('spotify', true);
  daemon.setMeetingDnd(false);
  const order: SourceName[] = ['zoom', ...DEFAULT_SOURCE_ORDER.filter(source => source !== 'zoom')];
  const changing = daemon.setSourceOrder(order);
  await vi.advanceTimersByTimeAsync(2500);
  await changing;
  await telemetry.shutdown();
  expect(events.filter(event => event.event === 'settings_changed').map(event => event.properties))
    .toEqual(expect.arrayContaining([
      expect.objectContaining({ setting: 'source', source: 'spotify', enabled: true }),
      expect.objectContaining({ setting: 'meeting_dnd', enabled: false }),
      expect.objectContaining({ setting: 'source_priority', source_priority: order }),
    ]));
  expect(events.find(event => event.event === 'status_operation')?.properties).toMatchObject({ source: 'zoom',
    enabled_sources: ['spotify', 'zoom'], source_priority: order, meeting_dnd: false });
});
it('describes current default source configuration even when no source has been used or setting changed', async () => {
  telemetry.start();
  await telemetry.shutdown();
  expect(events.find(event => event.event === 'app_activity')?.properties).toMatchObject({
    enabled_sources: DEFAULT_SOURCE_ORDER, source_priority: DEFAULT_SOURCE_ORDER, meeting_dnd: true,
    custom_status_count: expect.any(Number),
  });
  expect(events.filter(event => event.event === 'status_operation' || event.event === 'settings_changed')).toEqual([]);
});
it('distinguishes actionable command failure from no match, counts repeats and recovers only the affected probe', async () => {
  const { daemon } = createDaemon();
  const failure = Object.assign(new Error('Command failed: secret command and raw stdout'), {
    code: 2, signal: 'SIGTERM', stderr: 'lsof: Permission denied /Users/alice/private token=xoxb-secret\nPrivate artist - Private song',
    stdout: 'Private song 192.168.1.25',
  });
  vi.mocked(exec).mockRejectedValue(failure as never);
  expect((await daemon.getSourceStatuses()).zoom.isActive).toBe(false);
  expect((await daemon.getSourceStatuses()).zoom.isActive).toBe(false);
  await vi.advanceTimersByTimeAsync(65_000);
  vi.mocked(exec).mockRejectedValue(Object.assign(new Error('No processes'), { code: 1, stderr: '' }) as never);
  await daemon.getSourceStatuses();
  expect(events.filter(event => event.event === 'diagnostic_recovered')).toHaveLength(0);
  vi.mocked(exec).mockResolvedValue({ stdout: 'zoom UDP 127.0.0.1:5000', stderr: '' } as never);
  await daemon.getSourceStatuses();
  await telemetry.shutdown();
  expect(events.filter(event => event.event === '$exception')).toHaveLength(1);
  expect(events.find(event => event.event === '$exception')?.properties).toMatchObject({ component: 'source',
    source: 'zoom', step: 'zoom.network', failure_kind: 'command', exit_code: 2, signal: 'SIGTERM',
    message: expect.stringContaining('Permission denied'), enabled_sources: ['zoom'] });
  expect(events.find(event => event.event === 'diagnostic_summary')?.properties).toMatchObject({ occurrence_count: 2 });
  expect(events.find(event => event.event === 'diagnostic_recovered')?.properties).toMatchObject({ occurrence_count: 2 });
  expect(JSON.stringify(events)).not.toMatch(/alice|192\.168|127\.0|Private|raw stdout|secret command|xoxb-secret/);
});
it('reports malformed Now Playing data without its contents and keeps an unrelated meeting usable', async () => {
  const { daemon } = createDaemon();
  daemon.toggleSource('youtubeMusic', true);
  vi.mocked(exec).mockImplementation((async (command: string) => ({ stderr: '', stdout:
    command.startsWith('lsappinfo') ? 'ASN:0x0-0x123' : command.startsWith('lsof') ? 'zoom UDP 127.0.0.1:5000' : 'Private malformed track output',
  })) as unknown as typeof exec);
  const changing = daemon.setSourceOrder(DEFAULT_SOURCE_ORDER);
  await vi.advanceTimersByTimeAsync(2500);
  await changing;
  await telemetry.shutdown();
  expect(events.find(event => event.event === '$exception')?.properties).toMatchObject({
    component: 'source', source: 'youtubeMusic', step: 'youtubeMusic.now_playing.parse', failure_kind: 'parse',
  });
  expect(events.find(event => event.event === 'status_operation')?.properties).toMatchObject({
    source: 'zoom', winner: 'zoom', outcome: 'success',
  });
  const operation = events.find(event => event.event === 'status_operation')!;
  expect(events.find(event => event.event === '$exception')?.properties.operation_id).toBe(operation.properties.operation_id);
  expect(operation.properties.operation_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(events.filter(event => event.event === 'slack_request').every(event => event.properties.operation_id === operation.properties.operation_id)).toBe(true);
  expect(JSON.stringify(events)).not.toMatch(/Private malformed|ASN:|127\.0/);
});
it('keeps protected polling, expected missing processes, empty metadata and paused players quiet', async () => {
  const { daemon } = createDaemon();
  const holiday = daemon.setHoliday('30.12.2026');
  await vi.advanceTimersByTimeAsync(2500);
  await holiday;
  await daemon.start();
  await vi.advanceTimersByTimeAsync(7000);
  const count = events.filter(event => event.event === 'status_operation').length;
  await vi.advanceTimersByTimeAsync(65_000);
  expect(events.filter(event => event.event === 'status_operation')).toHaveLength(count);
  await daemon.stop();
  daemon.toggleSource('zoom', false);
  daemon.toggleSource('spotify', true);
  vi.mocked(exec).mockRejectedValue(Object.assign(new Error('No matching process'), { code: 1, stderr: '' }) as never);
  await daemon.getSourceStatuses();
  daemon.toggleSource('spotify', false);
  daemon.toggleSource('appleMusic', true);
  vi.mocked(exec).mockResolvedValue({ stdout: 'paused', stderr: '' } as never);
  await daemon.getSourceStatuses();
  daemon.toggleSource('appleMusic', false);
  daemon.toggleSource('youtubeMusic', true);
  vi.mocked(exec).mockImplementation((async (command: string) => ({ stdout: command.startsWith('lsappinfo') ? 'ASN:0x0-0x123' : 'null', stderr: '' })) as unknown as typeof exec);
  await daemon.getSourceStatuses();
  await telemetry.shutdown();
  expect(events.filter(event => event.event === '$exception' || event.event === 'diagnostic_recovered')).toEqual([]);
});
it('retires in-flight source observations on opt-out without replaying their diagnostics or operation links', async () => {
  const { daemon } = createDaemon();
  let resolveProbe!: (value: { stdout: string; stderr: string }) => void;
  vi.mocked(exec).mockImplementation((() => new Promise(resolve => { resolveProbe = resolve; })) as unknown as typeof exec);
  const changing = daemon.setSourceOrder(DEFAULT_SOURCE_ORDER);
  await vi.advanceTimersByTimeAsync(0);
  telemetry.setEnabled(false);
  telemetry.setEnabled(true);
  resolveProbe({ stdout: 'zoom UDP 127.0.0.1:5000', stderr: '' });
  await vi.advanceTimersByTimeAsync(2500);
  await changing;
  await telemetry.shutdown();
  expect(events.filter(event => event.event === 'status_operation' || event.event === '$exception')).toEqual([]);
  expect(events.filter(event => event.event === 'slack_request').every(event => !event.properties.operation_id)).toBe(true);
});
it('explains a music cooldown after a clock adjustment without counting it as successful source use', async () => {
  const { daemon } = createDaemon();
  daemon.toggleSource('zoom', false);
  daemon.toggleSource('spotify', true);
  let track = 'Private first track';
  vi.mocked(exec).mockImplementation((async (command: string) => ({ stderr: '', stdout:
    command.startsWith('pgrep') ? '42' : command.includes('player state') ? 'playing' : track,
  })) as unknown as typeof exec);
  const started = Date.now();
  const first = daemon.setSourceOrder(DEFAULT_SOURCE_ORDER);
  await vi.advanceTimersByTimeAsync(2500);
  await first;
  vi.setSystemTime(started + 1000);
  track = 'Private second track';
  await daemon.setSourceOrder(DEFAULT_SOURCE_ORDER);
  await telemetry.shutdown();
  const operations = events.filter(event => event.event === 'status_operation');
  expect(operations.map(event => event.properties.outcome)).toEqual(['success', 'skipped']);
  expect(operations[1].properties).toMatchObject({ source: 'spotify', reason: 'cooldown', targeted_workspaces: 0 });
  expect(JSON.stringify(events)).not.toMatch(/Private first|Private second/);
});
it('explains a lower-priority activation and keeps later unchanged decisions quiet', async () => {
  const { daemon } = createDaemon();
  daemon.toggleSource('spotify', true);
  let zoomActive = false;
  vi.mocked(exec).mockImplementation((async (command: string) => ({ stderr: '', stdout:
    command.startsWith('lsof') ? zoomActive ? 'zoom UDP 127.0.0.1:5000' : '' :
      command.startsWith('pgrep') ? '42' : command.includes('player state') ? 'playing' : 'Private track',
  })) as unknown as typeof exec);
  await daemon.start();
  await vi.advanceTimersByTimeAsync(7000);
  zoomActive = true;
  await vi.advanceTimersByTimeAsync(7000);
  const count = events.filter(event => event.event === 'status_operation').length;
  await vi.advanceTimersByTimeAsync(15_000);
  expect(events.filter(event => event.event === 'status_operation')).toHaveLength(count);
  await daemon.stop();
  await telemetry.shutdown();
  expect(events.filter(event => event.event === 'status_operation').map(event => event.properties))
    .toMatchObject([{ source: 'spotify', outcome: 'success' }, { winner: 'spotify', outcome: 'skipped', reason: 'priority',
      active_sources: ['spotify', 'zoom'], source_changes: [{ source: 'zoom', change: 'activated' }] }]);
});
it('drops a retired automatic operation when opt-out happens during an in-flight Slack request', async () => {
  const { daemon, post } = createDaemon();
  let rejectRequest!: (error: Error) => void;
  post.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRequest = reject; }));
  const changing = daemon.setSourceOrder(DEFAULT_SOURCE_ORDER);
  await vi.advanceTimersByTimeAsync(0);
  expect(rejectRequest).toBeTypeOf('function');
  telemetry.setEnabled(false);
  telemetry.setEnabled(true);
  rejectRequest(Object.assign(new Error('Previous automatic request failed'), { code: 'ECONNRESET' }));
  await vi.advanceTimersByTimeAsync(2500);
  await changing;
  await telemetry.shutdown();
  expect(events.filter(event => ['$exception', 'status_operation', 'slack_request', 'diagnostic_recovered'].includes(event.event))).toEqual([]);
});
it('treats unavailable macOS-only sources as inactivity without running commands on another platform', async () => {
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  const { daemon } = createDaemon();
  for (const source of ['spotify', 'appleMusic', 'youtubeMusic'] as const) daemon.toggleSource(source, true);
  const statuses = await daemon.getSourceStatuses();
  expect(Object.values(statuses).every(source => !source.isActive)).toBe(true);
  expect(exec).not.toHaveBeenCalled();
  await telemetry.shutdown();
  expect(events.filter(event => event.event === '$exception')).toEqual([]);
});
