// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAppConfigStore } from '../../config/appConfigStore';
import { createHostTelemetry, resolveTelemetryConfiguration, type TelemetryEvent } from '../telemetry';

let directory: string;
const hosts: ReturnType<typeof createHostTelemetry>[] = [];
const batches: Array<{ batch: Array<{ event: string; properties: Record<string, unknown>; distinct_id: string }> }> = [];
const fetchOutput: typeof fetch = async (_url, options) => {
  batches.push(JSON.parse(String(options?.body)));
  return new Response('{}', { status: 200 });
};

function host(environment: 'test' | 'development' = 'test') {
  const telemetry = createHostTelemetry({
    configStore: createAppConfigStore({ configDir: directory }),
    configuration: { environment, host: 'https://posthog.invalid', captureToken: 'phc_fake_test_only' },
    appVersion: '2.3.4',
    fetch: fetchOutput,
  });
  hosts.push(telemetry);
  return telemetry;
}

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'slack-telemetry-test-'));
  batches.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
});

afterEach(async () => {
  vi.useRealTimers();
  for (const telemetry of hosts.splice(0)) await telemetry.shutdown();
  fs.rmSync(directory, { recursive: true, force: true });
});

it('records startup and daily background activity with persistent, environment-scoped identity', async () => {
  const first = host();
  first.start();
  await vi.advanceTimersByTimeAsync(10_000);
  const startup = batches.flatMap(batch => batch.batch)[0];
  expect(startup).toMatchObject({
    event: 'app_activity',
    distinct_id: `test:${first.getSettings().diagnosticId}`,
    properties: {
      reason: 'startup', environment: 'test', app_version: '2.3.4',
      os_platform: process.platform, os_arch: process.arch,
      $geoip_disable: true, $process_person_profile: false,
    },
  });
  expect(first.getSettings().diagnosticId).toMatch(/^[0-9a-f-]{36}$/);
  await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
  expect(batches.flatMap(batch => batch.batch).map(event => event.properties.reason)).toEqual(['startup', 'daily']);
  await first.shutdown();
  const restarted = host('development');
  expect(restarted.getSettings().diagnosticId).toBe(first.getSettings().diagnosticId);
  restarted.start();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(batches.flatMap(batch => batch.batch).at(-1)?.distinct_id).toBe(`development:${first.getSettings().diagnosticId}`);
});

it('accepts only agreed event fields and cannot leak caller contents or override trusted attribution', async () => {
  const telemetry = host();
  telemetry.capture('app_activity', {
    reason: 'startup',
    ...{ environment: 'production', app_version: 'fake', token: 'xoxp-secret', status: 'private song',
      error: { headers: { Authorization: 'secret' } }, $set: { name: 'Alice' } },
  });
  expect(() => telemetry.capture('toString' as TelemetryEvent, { reason: 'startup' })).not.toThrow();
  telemetry.capture('app_activity', { reason: 'private arbitrary text' as 'startup' });
  await vi.advanceTimersByTimeAsync(10_000);
  const events = batches.flatMap(batch => batch.batch);
  expect(events).toHaveLength(1);
  expect(events[0].properties).toMatchObject({ environment: 'test', app_version: '2.3.4' });
  const output = JSON.stringify(events);
  for (const content of ['xoxp-secret', 'private', 'Authorization', 'Alice', '$set']) expect(output).not.toContain(content);
});

it('rejects missing or invalid environment and lets packaged test launches override bundled production explicitly', async () => {
  const bundled = { environment: 'production', host: 'https://posthog.invalid', captureToken: 'phc_fake_test_only' };
  const testHost = createHostTelemetry({
    configStore: createAppConfigStore({ configDir: directory }),
    configuration: resolveTelemetryConfiguration(bundled, { SLACK_STATUS_BOT_TELEMETRY_ENVIRONMENT: 'test' }),
    appVersion: '2.3.4', fetch: fetchOutput,
  });
  hosts.push(testHost);
  testHost.start();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(batches.flatMap(batch => batch.batch)[0].properties.environment).toBe('test');
  for (const environment of [undefined, '', 'staging', 'PRODUCTION']) {
    const invalid = createHostTelemetry({
      configStore: createAppConfigStore({ configDir: directory }),
      configuration: resolveTelemetryConfiguration(environment === undefined ? {} : bundled,
        environment === undefined ? {} : { SLACK_STATUS_BOT_TELEMETRY_ENVIRONMENT: environment }),
      appVersion: '2.3.4', fetch: fetchOutput,
    });
    hosts.push(invalid);
    invalid.start();
    expect(invalid.getSettings().environment).toBeNull();
  }
  await vi.advanceTimersByTimeAsync(10_000);
  expect(batches.flatMap(batch => batch.batch)).toHaveLength(1);
});

it('discards queued activity on opt-out, preserves other settings and never replays the disabled interval', async () => {
  fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify({
    meetingDnd: false, sources: { spotify: false }, customNote: 'keep', slackTokens: ['fake-local-token'],
  }));
  const telemetry = host();
  telemetry.start();
  telemetry.setEnabled(false);
  await vi.advanceTimersByTimeAsync(2 * 24 * 60 * 60 * 1000);
  expect(batches).toHaveLength(0);
  const restarted = host();
  expect(restarted.getSettings()).toMatchObject({ enabled: false, diagnosticId: telemetry.getSettings().diagnosticId });
  restarted.start();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(batches).toHaveLength(0);
  restarted.setEnabled(true);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(batches).toHaveLength(0);
  restarted.capture('app_activity', { reason: 'daily' });
  await vi.advanceTimersByTimeAsync(10_000);
  expect(batches.flatMap(batch => batch.batch)).toHaveLength(1);
  expect(createAppConfigStore({ configDir: directory }).load()).toMatchObject({
    meetingDnd: false, sources: { spotify: false }, slackTokens: ['fake-local-token'],
  });
  expect(JSON.parse(fs.readFileSync(path.join(directory, 'config.json'), 'utf8')).customNote).toBe('keep');
});

it('aborts a pending request and prevents its retries after opt-out and re-enable', async () => {
  const requests: AbortSignal[] = [];
  const telemetry = createHostTelemetry({
    configStore: createAppConfigStore({ configDir: directory }),
    configuration: { environment: 'test', host: 'https://posthog.invalid', captureToken: 'phc_fake_test_only' },
    appVersion: '2.3.4',
    fetch: async (_url, init) => {
      requests.push(init.signal!);
      return new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted'))));
    },
  });
  hosts.push(telemetry);
  telemetry.start();
  await vi.advanceTimersByTimeAsync(5000);
  expect(requests).toHaveLength(1);
  telemetry.setEnabled(false);
  expect(requests[0].aborted).toBe(true);
  telemetry.setEnabled(true);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(requests).toHaveLength(1);
});

it('drops excess buffered events instead of replaying an unbounded burst', async () => {
  const telemetry = host();
  for (let i = 0; i < 1000; i++) telemetry.capture('app_activity', { reason: 'daily' });
  const shutdown = telemetry.shutdown();
  await vi.advanceTimersByTimeAsync(3000);
  await shutdown;
  const delivered = batches.flatMap(batch => batch.batch).length;
  expect(delivered).toBeGreaterThan(0);
  expect(delivered).toBeLessThanOrEqual(120);
});

it('finishes shutdown within its budget while a transport is unresponsive and stops later retries', async () => {
  let delivered = 0;
  const telemetry = createHostTelemetry({
    configStore: createAppConfigStore({ configDir: directory }),
    configuration: { environment: 'test', host: 'https://posthog.invalid', captureToken: 'phc_fake_test_only' },
    appVersion: '2.3.4',
    fetch: async (_url, init) => {
      delivered += JSON.parse(String(init.body)).batch.length;
      return new Promise(() => {});
    },
  });
  hosts.push(telemetry);
  for (let i = 0; i < 1000; i++) telemetry.capture('app_activity', { reason: 'daily' });
  const shutdown = telemetry.shutdown();
  await vi.advanceTimersByTimeAsync(3000);
  await shutdown;
  const countAtShutdown = delivered;
  await vi.advanceTimersByTimeAsync(30_000);
  expect(delivered).toBe(countAtShutdown);
  expect(delivered).toBeGreaterThan(0);
});

it('summarizes source health once per window and discards old or disabled observations', async () => {
  const telemetry = host();
  const epoch = telemetry.getCaptureEpoch();
  for (let index = 0; index < 40; index++) telemetry.observeSourceCheck({ source: 'zoom', enabled: true,
    active: index < 30, failed: index === 39, duration_ms: 25 }, epoch);
  telemetry.observeSourceCheck({ source: 'spotify', enabled: false, active: false, failed: false, duration_ms: 0 }, epoch);
  telemetry.observeSourceDecision({ active: ['zoom', 'teams'], winner: 'zoom', protected: true }, epoch);
  await vi.advanceTimersByTimeAsync(3_610_000);
  const summaries = batches.flatMap(batch => batch.batch).filter(event => event.event === 'source_health_summary');
  expect(summaries).toHaveLength(2);
  expect(summaries.find(event => event.properties.source === 'zoom')?.properties).toMatchObject({
    checks: 40, active_checks: 30, failed_checks: 1, duration_total_ms: 1000, duration_max_ms: 25,
    selected_checks: 1, protected_checks: 1, transitions: 1,
  });
  expect(summaries.find(event => event.properties.source === 'teams')?.properties.priority_blocked_checks).toBe(1);
  telemetry.observeSourceCheck({ source: 'zoom', enabled: true, active: true, failed: false, duration_ms: 10 }, epoch);
  telemetry.setEnabled(false);
  telemetry.setEnabled(true);
  telemetry.observeSourceCheck({ source: 'zoom', enabled: true, active: true, failed: false, duration_ms: 10 }, epoch);
  await telemetry.shutdown();
  expect(batches.flatMap(batch => batch.batch).filter(event => event.event === 'source_health_summary')).toHaveLength(2);
});

it('counts successful automation followed by a manual action once and forgets quality context at opt-out', async () => {
  const telemetry = host();
  const operation = { operation_id: '11111111-1111-4111-8111-111111111111', trigger: 'automatic' as const, source: 'zoom' as const,
    outcome: 'success' as const, reason: 'delivered' as const, targeted_workspaces: 1, successful_workspaces: 1, workspace_results: [], duration_ms: 200 };
  telemetry.capture('status_operation', operation);
  await vi.advanceTimersByTimeAsync(45_000);
  telemetry.capture('status_operation', { ...operation, trigger: 'manual', operation_id: '22222222-2222-4222-8222-222222222222' });
  telemetry.capture('status_operation', { ...operation, trigger: 'manual' });
  telemetry.capture('settings_changed', { setting: 'source', source: 'zoom', enabled: false });
  await vi.advanceTimersByTimeAsync(10_000);
  const quality = batches.flatMap(batch => batch.batch).filter(event => event.event === 'automation_quality');
  expect(quality.map(event => event.properties.kind)).toEqual(['manual_followed_automation', 'source_disabled_after_use']);
  expect(quality[0].properties).toMatchObject({ elapsed_ms: 45_000, previous_operation_id: operation.operation_id });
  telemetry.capture('status_operation', operation);
  telemetry.setEnabled(false); telemetry.setEnabled(true);
  telemetry.capture('status_operation', { ...operation, trigger: 'manual' });
  await telemetry.shutdown();
  expect(batches.flatMap(batch => batch.batch).filter(event => event.event === 'automation_quality')).toHaveLength(2);
});

it('samples app resources locally and emits weighted hourly totals with app version and run identity', async () => {
  const telemetry = createHostTelemetry({ configStore: createAppConfigStore({ configDir: directory }),
    configuration: { environment: 'test', host: 'https://posthog.invalid', captureToken: 'phc_fake' }, appVersion: '2.4.0',
    runtimeContext: () => ({ daemon_ready: true, connected_workspaces: 2, configured_workspaces: 3 }),
    readResourceUsage: () => ({ cpu_percent: 2, memory_mb: 120 }), systemVersion: '26.1', fetch: fetchOutput });
  hosts.push(telemetry);
  telemetry.start();
  await vi.advanceTimersByTimeAsync(3_610_000);
  const summary = batches.flatMap(batch => batch.batch).find(event => event.event === 'performance_summary');
  expect(summary?.properties).toMatchObject({ samples: 60, cpu_percent_total: 120, cpu_percent_max: 2,
    memory_mb_total: 7200, memory_mb_max: 120, app_version: '2.4.0', daemon_ready: true,
    connected_workspaces: 2, configured_workspaces: 3, os_version: '26.1' });
  expect(summary?.properties.app_run_id).toMatch(/^[0-9a-f-]{36}$/);
  telemetry.setEnabled(false);
  await vi.advanceTimersByTimeAsync(3_600_000);
  expect(batches.flatMap(batch => batch.batch).filter(event => event.event === 'performance_summary')).toHaveLength(1);
});

it('keeps diagnostics best effort when configuration storage becomes unavailable', async () => {
  const store = createAppConfigStore({ configDir: directory });
  const telemetry = createHostTelemetry({ configStore: store,
    configuration: { environment: 'test', host: 'https://posthog.invalid', captureToken: 'phc_fake' }, appVersion: '2.4.0', fetch: fetchOutput });
  hosts.push(telemetry);
  vi.spyOn(store, 'getDaemonSettings').mockImplementation(() => { throw new Error('EACCES writing config'); });
  expect(() => telemetry.reportDiagnostic(new Error('Original application failure'), { component: 'runtime', step: 'ipc.test' })).not.toThrow();
  await telemetry.shutdown();
  expect(batches).toHaveLength(0);
});

it('keeps each event context at observation time while the queued app becomes ready', async () => {
  let ready = false;
  const telemetry = createHostTelemetry({ configStore: createAppConfigStore({ configDir: directory }),
    configuration: { environment: 'test', host: 'https://posthog.invalid', captureToken: 'phc_fake' }, appVersion: '2.4.0',
    runtimeContext: () => ({ daemon_ready: ready, connected_workspaces: ready ? 2 : 0, configured_workspaces: 2 }), fetch: fetchOutput });
  hosts.push(telemetry);
  telemetry.start();
  ready = true;
  telemetry.capture('runtime_state', { reason: 'startup', state: 'ready', duration_ms: 1000 });
  telemetry.capture('connections_restored', { connected_workspaces: 1, unverified_workspaces: 1, authorization_required_workspaces: 0 });
  await telemetry.shutdown();
  const events = batches.flatMap(batch => batch.batch);
  expect(events.find(event => event.event === 'app_activity')?.properties).toMatchObject({ daemon_ready: false, connected_workspaces: 0 });
  expect(events.find(event => event.event === 'runtime_state')?.properties).toMatchObject({ daemon_ready: true, connected_workspaces: 2 });
  expect(events.find(event => event.event === 'connections_restored')?.properties.connected_workspaces).toBe(1);
});
