// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import axios from 'axios';
import { SlackStatusBotDaemon } from '../../daemon';
import { createAppConfigStore } from '../../config/appConfigStore';
import { createHostTelemetry } from '../telemetry';
import { telemetryEvents, type TelemetryEvent } from '../telemetryEvents';
import { z } from 'zod';
import { registerPlatformIpcHandlers } from '../ipcHandlers';
import { IPC_CHANNELS, type IpcChannel, type IpcResult } from '../../contracts/ipc';
import { STATUS_MESSAGES } from '../../config/statusConfig';

vi.mock('axios');
let directory: string;
let transportAvailable: boolean;
let telemetry: ReturnType<typeof createHostTelemetry>;
type CapturedEvent = { [E in TelemetryEvent]: { event: E; properties: z.output<(typeof telemetryEvents)[E]> } }[TelemetryEvent];
let events: CapturedEvent[];
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-telemetry-'));
  events = [];
  transportAvailable = true;
  vi.useFakeTimers();
  telemetry = createHostTelemetry({
    configStore: createAppConfigStore({ configDir: directory }),
    configuration: { environment: 'test', host: 'https://posthog.invalid', captureToken: 'phc_fake' },
    appVersion: '2.3.4',
    autostartEnabled: false,
    fetch: async (_url, init) => {
      if (!transportAvailable) throw new Error('Synthetic transport unavailable');
      events.push(...JSON.parse(String(init.body)).batch);
      return new Response('{}');
    },
  });
});
afterEach(async () => {
  vi.useRealTimers();
  await telemetry.shutdown();
  vi.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

it('reports actual partial manual delivery and its original permission cause despite a UI state update', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const post = vi.fn(async (url: string, _body: unknown, options: { headers: { Authorization: string } }) => ({
    status: 200, headers: {}, data: url === '/users.profile.set' && options.headers.Authorization === 'Bearer token-a'
      ? { ok: false, error: 'missing_scope', needed: 'users.profile:write', provided: 'users:read' }
      : { ok: true },
  }));
  vi.mocked(axios.create).mockReturnValue({ post } as unknown as ReturnType<typeof axios.create>);
  const uiUpdate = vi.fn();
  const daemon = new SlackStatusBotDaemon({ slackTokens: ['token-a', 'token-b'], configDir: directory,
    telemetry, onAppStateChanged: uiUpdate });
  const pending = daemon.setStatus(STATUS_MESSAGES.MEETING_EMOJI, 'Private meeting', 'dashboard');
  await vi.advanceTimersByTimeAsync(500);
  expect(await pending).toBe(false);
  await telemetry.shutdown();
  const operation = events.find(event => event.event === 'status_operation')!;
  expect(operation?.properties).toMatchObject({ trigger: 'manual', action: 'meeting', entry_point: 'dashboard',
    outcome: 'partial', targeted_workspaces: 2, successful_workspaces: 1, autostart_enabled: false,
    workspace_results: [ { profile: 'failed', presence: 'success', dnd: 'success' },
      { profile: 'success', presence: 'success', dnd: 'success' } ] });
  expect(uiUpdate).toHaveBeenCalled();
  const error = events.find(event => event.event === '$exception')!;
  expect(error?.properties).toMatchObject({ operation_id: operation.properties.operation_id,
    component: 'slack', step: 'users.profile.set', code: 'missing_scope', http_status: 200,
    needed_scopes: ['users.profile:write'], provided_scopes: ['users:read'], attempt: 1 });
  expect(operation.properties.workspace_results[0].connection_ref).toMatch(/^[0-9a-f-]{36}$/);
  expect(JSON.stringify(events)).not.toMatch(/token-a|token-b|Private meeting|spiral_calendar/);
});

it('links a failed persistence retry and later catch-up without recounting the manual action', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let postCount = 0;
  let recovered = false;
  const post = vi.fn(async (url: string) => ({ status: 200, headers: {},
    data: url === '/users.profile.set' && ++postCount === 2
      ? { ok: false, error: 'service_unavailable' } : { ok: true } }));
  const get = vi.fn(async () => ({ data: { ok: true, profile: {
    status_emoji: recovered ? ':user_owned:' : ':old:', status_text: recovered ? 'Secret' : 'Old',
  } } }));
  vi.mocked(axios.create).mockReturnValue({ post, get } as unknown as ReturnType<typeof axios.create>);
  const daemon = new SlackStatusBotDaemon({ slackTokens: ['token-a'], configDir: directory, telemetry });
  const pending = daemon.setExternalStatus(':user_owned:', 'Secret');
  await vi.advanceTimersByTimeAsync(2500);
  expect(await pending).toBe(false);
  recovered = true;
  await daemon.runCorrectionCycle();
  await telemetry.shutdown();
  const operations = events.filter(event => event.event === 'status_operation');
  expect(operations).toHaveLength(1);
  expect(operations[0].properties).toMatchObject({ action: 'external', outcome: 'partial', successful_workspaces: 0 });
  const requests = events.filter(event => event.event === 'slack_request').filter(event => event.properties.step === 'users.profile.set');
  expect(requests.map(event => [event.properties.attempt, event.properties.result, event.properties.operation_id]))
    .toEqual([[1, 'success', operations[0].properties.operation_id], [2, 'failed', operations[0].properties.operation_id],
      [3, 'success', operations[0].properties.operation_id]]);
  expect(events.find(event => event.event === 'diagnostic_recovered')?.properties)
    .toMatchObject({ code: 'service_unavailable', recovery_operation_id: operations[0].properties.operation_id });
});

it('summarizes repeated causes with safe original-source stacks and recovers only after a successful affected call', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let broken = true;
  const failure = Object.assign(new Error('ECONNRESET status_text="Private song" Authorization: Bearer xoxb-topsecret /Users/alice/private/file token=oauth-secret artist=Unquoted private artist'), { code: 'ECONNRESET' });
  failure.stack = `${failure.message}\n    at send (/Users/alice/project/src/services/slack.ts:213:17)\n    at secret (/Users/alice/private/file.js:4:2)`;
  const post = vi.fn(async (url: string) => {
    if (url === '/users.profile.set' && broken) throw failure;
    return { status: 200, headers: {}, data: { ok: true } };
  });
  const get = vi.fn(async () => ({ data: { ok: true, profile: { status_emoji: ':custom:', status_text: 'Private song' } } }));
  vi.mocked(axios.create).mockReturnValue({ post, get } as unknown as ReturnType<typeof axios.create>);
  const daemon = new SlackStatusBotDaemon({ slackTokens: ['token-a'], configDir: directory, telemetry });
  await daemon.setExternalStatus(':custom:', 'Private song');
  await daemon.setExternalStatus(':custom:', 'Private song');
  await vi.advanceTimersByTimeAsync(10_000);
  expect(events.filter(event => event.event === '$exception')).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(55_000);
  const summary = events.find(event => event.event === 'diagnostic_summary')!;
  expect(summary?.properties).toMatchObject({ occurrence_count: 2, code: 'ECONNRESET', timeout: false,
    stack: expect.stringContaining('src/services/slack.ts:213:17') });
  expect(events.filter(event => event.event === 'diagnostic_recovered')).toHaveLength(0);
  broken = false;
  const pending = daemon.setExternalStatus(':custom:', 'Private song');
  await vi.advanceTimersByTimeAsync(2500);
  expect(await pending).toBe(true);
  await telemetry.shutdown();
  const recovery = events.find(event => event.event === 'diagnostic_recovered')!;
  expect(recovery?.properties).toMatchObject({ episode_id: summary.properties.episode_id, occurrence_count: 2,
    recovery_operation_id: events.filter(event => event.event === 'status_operation').at(-1)!.properties.operation_id });
  const exception = events.find(event => event.event === '$exception')!;
  expect(exception.properties.$exception_fingerprint).toEqual(expect.any(String));
  expect(exception.properties.$exception_list[0].stacktrace?.frames).toEqual([
    { filename: 'src/services/slack.ts', function: '?', lineno: 213, colno: 17, in_app: true, platform: 'node:javascript' },
  ]);
  expect(JSON.stringify(events)).not.toMatch(/Private song|topsecret|oauth-secret|alice|token-a|private\/file|Bearer|Unquoted|private artist/);
});

it('drops diagnostic episode state and pending summaries on opt-out, including after re-enable', async () => {
  const context = { component: 'source' as const, step: 'spotify.probe' };
  telemetry.reportDiagnostic(new Error('Permission denied'), context);
  telemetry.reportDiagnostic(new Error('Permission denied'), context);
  telemetry.setEnabled(false);
  await vi.advanceTimersByTimeAsync(65_000);
  telemetry.setEnabled(true);
  telemetry.recoverDiagnostic(context);
  await telemetry.shutdown();
  expect(events).toEqual([]);
});

it('reports original application source locations when native source maps cannot resolve a compiled frame', async () => {
  const filename = `diagnostic-${path.basename(directory)}.js`;
  const mapFile = path.resolve(__dirname, '../../../dist/main', `${filename}.map`);
  fs.mkdirSync(path.dirname(mapFile), { recursive: true });
  fs.writeFileSync(mapFile, JSON.stringify({ version: 3, file: filename, sourceRoot: '',
    sources: ['../../src/services/slack.ts'], names: [], mappings: 'AAAA' }));
  try {
    const error = new Error('Connection failed');
    error.stack = `Error: Connection failed\n    at send (${mapFile.slice(0, -4)}:1:1)`;
    telemetry.reportDiagnostic(error, { component: 'runtime', step: 'compiled.location' });
    await telemetry.shutdown();
    const exception = events.find(event => event.event === '$exception')!;
    expect(exception.properties.$exception_list[0].stacktrace?.frames).toEqual([
      { filename: 'src/services/slack.ts', function: '?', lineno: 1, colno: 1,
        in_app: true, platform: 'node:javascript' },
    ]);
  } finally {
    fs.rmSync(mapFile, { force: true });
  }
});

it('retains separate HTTP causes and connection episodes without treating another component success as recovery', async () => {
  const a = 'b83bf9b0-85df-4d4f-9666-d44e4f593a14';
  const b = '657796f2-37c8-45e9-bda0-81ef98a7e9cc';
  const cause = { component: 'connection' as const, step: 'oauth.verify' };
  telemetry.reportDiagnostic({ response: { status: 429, headers: { 'retry-after': '12' }, data: { error: 'ratelimited' } } }, { ...cause, connection_ref: a });
  telemetry.reportDiagnostic({ response: { status: 403, data: { error: 'missing_scope' } } }, { ...cause, connection_ref: a });
  telemetry.reportDiagnostic({ response: { status: 403, data: { error: 'missing_scope' } } }, { ...cause, connection_ref: b });
  telemetry.recoverDiagnostic({ component: 'source', step: 'spotify.probe' });
  await telemetry.shutdown();
  expect(events.filter(event => event.event === '$exception')).toHaveLength(3);
  expect(events.find(event => 'code' in event.properties && event.properties.code === 'ratelimited')?.properties).toMatchObject({ http_status: 429, retry_after_seconds: 12, rate_limited: true });
  expect(events.filter(event => event.event === 'diagnostic_recovered')).toHaveLength(0);
});

it('does not leak a credential disguised as a service code or a stack filename at the shared output boundary', async () => {
  telemetry.reportDiagnostic({ response: { data: { error: 'xoxb-credential-secret' } } },
    { component: 'slack', step: 'users.profile.set' });
  telemetry.capture('$exception', {
    component: 'runtime', step: 'test', message: 'Failure', episode_id: 'b83bf9b0-85df-4d4f-9666-d44e4f593a14',
    occurrence_count: 1, first_seen: new Date().toISOString(), last_seen: new Date().toISOString(),
    $exception_fingerprint: 'a'.repeat(64), $exception_list: [{ type: 'Error', value: 'Failure',
      mechanism: { type: 'generic', handled: true }, stacktrace: { type: 'raw', frames: [
        { filename: '/Users/alice/private.ts', lineno: 1, colno: 2, in_app: true },
      ] } }],
  });
  await telemetry.shutdown();
  expect(JSON.stringify(events)).not.toMatch(/credential-secret|alice|private\.ts/);
});

it('preserves thrown application errors and distinguishes an invalid manual action from technical failure', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(axios.create).mockReturnValue({} as ReturnType<typeof axios.create>);
  const daemon = new SlackStatusBotDaemon({ slackTokens: [], configDir: directory, telemetry });
  expect(await daemon.setHoliday('invalid')).toBe(false);
  await expect(daemon.setExternalStatus(':coffee:', 'Private')).rejects.toThrow('No Slack tokens configured');
  await telemetry.shutdown();
  const outcomes = events.filter(event => event.event === 'status_operation').map(event => event.properties);
  expect(outcomes[0]).toMatchObject({ outcome: 'skipped', reason: 'no_workspaces' });
  expect(outcomes[1]).toMatchObject({ outcome: 'failed', reason: 'unexpected_error' });
  expect(events.find(event => event.event === '$exception')?.properties).toMatchObject({ component: 'runtime',
    step: 'status_operation', operation_id: outcomes[1].operation_id, message: 'No Slack tokens configured' });
});

it('records successful autostart and structural status settings changes through host IPC without free-form contents', async () => {
  const handlers = new Map<IpcChannel, (_event: unknown, ...args: unknown[]) => Promise<IpcResult<unknown>>>();
  registerPlatformIpcHandlers({ handle: (channel, handler) => { handlers.set(channel, handler); } }, {
    telemetry, setAutoLaunch: async enabled => ({ enabled }), getAutoLaunch: async () => ({ enabled: false }),
  });
  await expect(handlers.get(IPC_CHANNELS.setAutoLaunch)!(null, 'invalid')).resolves.toMatchObject({ success: false });
  await expect(handlers.get(IPC_CHANNELS.setAutoLaunch)!(null, true)).resolves.toMatchObject({ success: true });
  const daemon = new SlackStatusBotDaemon({ slackTokens: [], configDir: directory, telemetry });
  expect(await daemon.updateStatusConfiguration([{ id: 'private-name', emoji: ':secret:', message: 'Private content',
    category: 'quick_action', days: [], enableDND: false, presence: 'auto' }])).toBe(true);
  await telemetry.shutdown();
  expect(events.filter(event => event.event === 'settings_changed').map(event => event.properties))
    .toMatchObject([{ setting: 'autostart', enabled: true, autostart_enabled: true }, { setting: 'custom_statuses', custom_status_count: 1, reset: false, autostart_enabled: true }]);
  expect(JSON.stringify(events)).not.toMatch(/Private content|private-name|secret/);
});

it('continues a deliberate user action while tracking delivery is unavailable', async () => {
  transportAvailable = false;
  // The SDK logs this deliberately simulated transport outage locally.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const profile = { status_emoji: ':custom:', status_text: 'Private content' };
  const post = vi.fn(async () => ({ status: 200, headers: {}, data: { ok: true } }));
  const get = vi.fn(async () => ({ data: { ok: true, profile } }));
  vi.mocked(axios.create).mockReturnValue({ post, get } as unknown as ReturnType<typeof axios.create>);
  const daemon = new SlackStatusBotDaemon({ slackTokens: ['token-a'], configDir: directory, telemetry });
  telemetry.start();
  const pending = daemon.setExternalStatus(profile.status_emoji, profile.status_text);
  await vi.advanceTimersByTimeAsync(2500);
  expect(await pending).toBe(true);
  await vi.advanceTimersByTimeAsync(10_000);
  expect((await daemon.getSlackStatus()).text).toBe('Private content');
  expect(events).toEqual([]);
});

it('does not reuse pre-opt-out operation links or disabled-period attempts after collection resumes', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let broken = true;
  const post = vi.fn(async () => ({ status: 200, headers: {}, data: { ok: !broken, error: broken ? 'service_unavailable' : undefined } }));
  const get = vi.fn(async () => ({ data: { ok: true, profile: { status_emoji: ':custom:', status_text: 'Private' } } }));
  vi.mocked(axios.create).mockReturnValue({ post, get } as unknown as ReturnType<typeof axios.create>);
  const daemon = new SlackStatusBotDaemon({ slackTokens: ['token-a'], configDir: directory, telemetry });
  expect(await daemon.setExternalStatus(':custom:', 'Private')).toBe(false);
  telemetry.setEnabled(false);
  await daemon.runCorrectionCycle();
  telemetry.setEnabled(true);
  broken = false;
  await daemon.runCorrectionCycle();
  await telemetry.shutdown();
  expect(events.filter(event => event.event === 'status_operation' || event.event === 'diagnostic_recovered')).toEqual([]);
  expect(events.filter(event => event.event === 'slack_request').map(event => event.properties))
    .toEqual(expect.arrayContaining([expect.objectContaining({ result: 'success', attempt: 1 })]));
  expect(events.filter(event => event.event === 'slack_request').every(event => !event.properties.operation_id)).toBe(true);
});

it('keeps a repeated technical cause in one episode when the retry has a different caller stack', async () => {
  const context = { component: 'source' as const, step: 'teams.probe' };
  const first = new Error('Permission denied');
  first.stack = 'Error: Permission denied\n    at probe (/Users/alice/app/src/services/probe.ts:10:2)\n    at poll (/Users/alice/app/src/daemon.ts:300:1)';
  const retry = new Error('Permission denied');
  retry.stack = 'Error: Permission denied\n    at probe (/Users/alice/app/src/services/probe.ts:10:2)\n    at retry (/Users/alice/app/src/daemon.ts:400:1)';
  telemetry.reportDiagnostic(first, context);
  telemetry.reportDiagnostic(retry, context);
  await vi.advanceTimersByTimeAsync(65_000);
  telemetry.recoverDiagnostic(context);
  await telemetry.shutdown();
  expect(events.filter(event => event.event === '$exception')).toHaveLength(1);
  expect(events.find(event => event.event === 'diagnostic_summary')?.properties).toMatchObject({ occurrence_count: 2 });
  expect(events.find(event => event.event === 'diagnostic_recovered')?.properties).toMatchObject({ occurrence_count: 2 });
});

it('counts existing deliberate controls by fixed category while external commands retain authority over a protected holiday', async () => {
  let profile = { status_emoji: '', status_text: '' };
  const post = vi.fn(async (url: string, body: { profile?: typeof profile }) => {
    if (url === '/users.profile.set') profile = body.profile!;
    return { status: 200, headers: {}, data: { ok: true } };
  });
  const get = vi.fn(async () => ({ data: { ok: true, profile } }));
  vi.mocked(axios.create).mockReturnValue({ post, get } as unknown as ReturnType<typeof axios.create>);
  const daemon = new SlackStatusBotDaemon({ slackTokens: ['token-a'], configDir: directory, telemetry });
  const actions = [
    () => daemon.goOnline('dashboard'),
    () => daemon.goAway('tray'),
    () => daemon.setStatus(STATUS_MESSAGES.FOCUS_EMOJI, 'Private focus', 'dashboard'),
    () => daemon.setStatus(STATUS_MESSAGES.BREAK_EMOJI, 'Private break', 'tray'),
    () => daemon.setHoliday('30.12.2026', 'dashboard'),
    () => daemon.setExternalStatus(':private_emoji:', 'Private shortcut'),
  ];
  for (const action of actions) {
    const pending = action();
    await vi.advanceTimersByTimeAsync(2500);
    expect(await pending).toBe(true);
  }
  await telemetry.shutdown();
  const operations = events.filter(event => event.event === 'status_operation');
  expect(operations.map(event => [event.properties.action, event.properties.entry_point, event.properties.outcome]))
    .toEqual([['online', 'dashboard', 'success'], ['away', 'tray', 'success'], ['focus', 'dashboard', 'success'],
      ['break', 'tray', 'success'], ['holiday', 'dashboard', 'success'], ['external', 'external', 'success']]);
  expect(operations.at(-1)?.properties).toMatchObject({ protected_status: true });
  expect((await daemon.getSlackStatus()).text).toBe('Private shortcut');
  expect(JSON.stringify(events)).not.toMatch(/Private focus|Private break|Private shortcut|private_emoji|30\.12\.2026/);
});
