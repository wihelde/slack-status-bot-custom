// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAppConfigStore } from '../../config/appConfigStore';
import { createHostTelemetry } from '../telemetry';
import { NativeSlackOAuth, exchangeSlackCode } from '../nativeSlackOAuth';
import { WorkspaceConnections, verifySlackToken } from '../workspaceConnections';

let directory: string;
let telemetry: ReturnType<typeof createHostTelemetry>;
let events: { event: string; properties: Record<string, unknown> }[];
const encryption = {
  isEncryptionAvailable: () => true,
  encryptString: (value: string) => Buffer.from(`sealed:${value}`),
  decryptString: (value: Buffer) => value.toString().replace(/^sealed:/, ''),
};
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'connection-telemetry-'));
  events = [];
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
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});
function application(storage = encryption) {
  const config = createAppConfigStore({ configDir: directory });
  const connections = new WorkspaceConnections({ directory, config, encryption: storage, verify: verifySlackToken, telemetry });
  let browserUrl = '';
  const oauth = new NativeSlackOAuth({ connections, telemetry, exchange: exchangeSlackCode, verify: verifySlackToken,
    openExternal: async url => { browserUrl = url; }, onConnected: () => {} });
  return { connections, oauth, callback: (query = 'code=synthetic-code') =>
    `slack-status-bot://oauth?state=${new URL(browserUrl).searchParams.get('state')}&${query}` };
}
function slack(verification: object) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/auth.test')
    ? verification : { ok: true, authed_user: { token_type: 'user', access_token: 'synthetic-access',
      refresh_token: 'synthetic-refresh', expires_in: 43200 } }))));
}
it('links failed verification to setup while retaining Slack permission details and excluding credentials', async () => {
  slack({ ok: false, error: 'missing_scope', needed: 'users:read', provided: 'users:write',
    team: 'Private workspace', user: 'Private user', team_id: 'T123456789', user_id: 'U123456789' });
  const app = application();
  await app.oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T123456789');
  const callback = app.callback();
  await app.oauth.handleUrl(callback);
  await telemetry.shutdown();
  const start = events.find(event => event.event === 'connection_started')!;
  const completion = events.find(event => event.event === 'connection_completed')!;
  expect(start?.properties).toMatchObject({ flow: 'setup', environment: 'test', app_version: '2.3.4' });
  expect(completion?.properties).toMatchObject({ operation_id: start.properties.operation_id,
    flow: 'setup', outcome: 'failed', step: 'oauth.verify', reason: 'technical_failure' });
  expect(events.find(event => event.event === '$exception')?.properties).toMatchObject({
    operation_id: start.properties.operation_id, component: 'connection', step: 'oauth.verify',
    code: 'missing_scope', http_status: 200, needed_scopes: ['users:read'], provided_scopes: ['users:write'] });
  expect(app.connections.list()).toEqual([]);
  expect(JSON.stringify(events)).not.toMatch(/synthetic-access|synthetic-refresh|synthetic-code|Private|T123456789|U123456789|slack-status-bot:|code_challenge|verifier/);
  expect(JSON.stringify(events)).not.toContain(new URL(callback).searchParams.get('state'));
});
it('separates restored connections, successful setup, Reconnect and normal cancellation without duplicate onboarding', async () => {
  slack({ ok: true, team_id: 'T-A', team: 'Private workspace', user_id: 'U-A', user: 'Private user' });
  const app = application();
  await app.oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T-A');
  await app.oauth.handleUrl(app.callback('error=access_denied'));
  await app.oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T-A');
  await app.oauth.handleUrl(app.callback());
  await app.oauth.reconnect('T-A');
  await app.oauth.handleUrl(app.callback());
  const restored = application();
  await restored.connections.migrate();
  await restored.connections.migrate();
  await telemetry.shutdown();
  const completions = events.filter(event => event.event === 'connection_completed');
  expect(completions.map(event => [event.properties.flow, event.properties.outcome])).toEqual([
    ['setup', 'cancelled'], ['setup', 'success'], ['reconnect', 'success'],
  ]);
  expect(completions[1].properties).toMatchObject({ first_connection: true, replaced_existing: false });
  expect(completions[2].properties).toMatchObject({ first_connection: false, replaced_existing: true });
  expect(events.filter(event => event.event === 'connections_restored').map(event => event.properties)).toEqual([
    expect.objectContaining({ connected_workspaces: 1, unverified_workspaces: 0, authorization_required_workspaces: 0 }),
  ]);
  expect(events.filter(event => event.event === '$exception')).toEqual([]);
  expect(restored.connections.activeTokens()).toEqual(['synthetic-access']);
});
it('retains token-exchange HTTP and service causes without exposing the response or callback', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'invalid_code',
    access_token: 'synthetic-access', state: 'private-state', user: 'Private user' }), { status: 400 })));
  const app = application();
  await app.oauth.handleUrl('slack-status-bot://connect?client_id=1.1');
  await app.oauth.handleUrl(app.callback());
  await telemetry.shutdown();
  expect(events.find(event => event.event === '$exception')?.properties).toMatchObject({
    component: 'connection', step: 'oauth.exchange', code: 'invalid_code', http_status: 400, message: 'invalid_code' });
  expect(events.find(event => event.event === 'connection_completed')?.properties).toMatchObject({ outcome: 'failed', step: 'oauth.exchange' });
  expect(JSON.stringify(events)).not.toMatch(/synthetic-access|synthetic-code|private-state|Private user/);
});
it('counts renewal delays, preserves native network causes and recovers only after actual renewal, distinguishing authorization loss', async () => {
  vi.useFakeTimers();
  // Create the shared boundary under the same clock as the application.
  await telemetry.shutdown();
  telemetry = createHostTelemetry({ configStore: createAppConfigStore({ configDir: directory }),
    configuration: { environment: 'test', host: 'https://posthog.invalid', captureToken: 'phc_fake' },
    appVersion: '2.3.4', fetch: async (_url, init) => { events.push(...JSON.parse(String(init.body)).batch); return new Response('{}'); } });
  let renewal: 'network' | 'success' | 'revoked' = 'network';
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if ((init.body as URLSearchParams | undefined)?.get('grant_type') === 'refresh_token') {
      if (renewal === 'network') throw new TypeError('fetch failed', { cause: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }) });
      return new Response(JSON.stringify(renewal === 'revoked' ? { ok: false, error: 'invalid_refresh_token' }
        : { ok: true, token_type: 'user', access_token: 'renewed-access', refresh_token: 'renewed-refresh', expires_in: 43200 }));
    }
    return new Response(JSON.stringify(url.endsWith('/auth.test')
      ? { ok: true, team_id: 'T-A', team: 'Private workspace', user_id: 'U-A', user: 'Private user' }
      : { ok: true, authed_user: { token_type: 'user', access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_in: 43200 } }));
  }));
  const app = application();
  await app.oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T-A');
  await app.oauth.handleUrl(app.callback());
  vi.setSystemTime(Date.now() + 11.5 * 60 * 60_000);
  await app.oauth.renewDue();
  expect(app.connections.list()[0]).toMatchObject({ state: 'connected', refreshIssue: 'temporary' });
  await vi.advanceTimersByTimeAsync(60_000);
  await app.oauth.renewDue();
  await vi.advanceTimersByTimeAsync(65_000);
  expect(events.filter(event => event.event === 'diagnostic_recovered')).toEqual([]);
  renewal = 'success';
  await app.oauth.renewDue();
  expect(app.connections.activeTokens()).toEqual(['renewed-access']);
  vi.setSystemTime(Date.now() + 11.5 * 60 * 60_000);
  renewal = 'revoked';
  await app.oauth.renewDue();
  await telemetry.shutdown();
  const error = events.find(event => event.event === '$exception' && event.properties.step === 'oauth.renew')!;
  expect(error?.properties).toMatchObject({ network_code: 'ECONNRESET', code: 'ECONNRESET', message: 'fetch failed: socket hang up' });
  expect(events.find(event => event.event === 'diagnostic_summary')?.properties).toMatchObject({ episode_id: error.properties.episode_id, occurrence_count: 2 });
  expect(events.find(event => event.event === 'diagnostic_recovered')?.properties).toMatchObject({ episode_id: error.properties.episode_id, occurrence_count: 2 });
  expect(events.filter(event => event.event === 'connection_renewal').map(event => event.properties.outcome)).toEqual(['retrying', 'retrying', 'renewed', 'reconnect_required']);
  expect(events.find(event => event.event === '$exception' && event.properties.code === 'invalid_refresh_token')?.properties).toMatchObject({ step: 'oauth.renew', http_status: 200 });
  expect(app.connections.list()[0].state).toBe('auth-required');
  expect(events.filter(event => event.event === 'connection_completed')).toHaveLength(1);
  expect(JSON.stringify(events)).not.toMatch(/synthetic-access|synthetic-refresh|renewed-access|renewed-refresh|Private|T-A|U-A/);
});
it('diagnoses repeated verification of a migrated connection and recovery without counting onboarding', async () => {
  const config = createAppConfigStore({ configDir: directory });
  config.updateSlackTokens(['legacy-private-token']);
  let available = false;
  vi.stubGlobal('fetch', vi.fn(async () => available
    ? new Response(JSON.stringify({ ok: true, team_id: 'T-A', team: 'Private workspace', user_id: 'U-A', user: 'Private user' }))
    : new Response(JSON.stringify({ ok: false, error: 'ratelimited' }), { status: 429, headers: { 'Retry-After': '12' } })));
  const app = application();
  await app.connections.migrate();
  await app.connections.migrate();
  available = true;
  await app.connections.migrate();
  await telemetry.shutdown();
  const error = events.find(event => event.event === '$exception')!;
  expect(error?.properties).toMatchObject({ component: 'connection', step: 'connection.verify', code: 'ratelimited', http_status: 429, retry_after_seconds: 12 });
  expect(events.find(event => event.event === 'diagnostic_recovered')?.properties).toMatchObject({ episode_id: error.properties.episode_id, occurrence_count: 2 });
  expect(events.filter(event => event.event === 'connection_completed' || event.event === 'connection_started')).toEqual([]);
  expect(app.connections.activeTokens()).toEqual(['legacy-private-token']);
  expect(JSON.stringify(events)).not.toMatch(/legacy-private-token|Private|T-A|U-A/);
});
it('preserves OS persistence failures and closes their episode only after a durable retry', async () => {
  slack({ ok: true, team_id: 'T-A', team: 'Private workspace', user_id: 'U-A', user: 'Private user' });
  let blocked = true;
  const storage = { ...encryption, encryptString: (value: string) => {
    if (blocked) throw Object.assign(new Error('Keychain unavailable /Users/private/person'), { code: 'EACCES' });
    return encryption.encryptString(value);
  } };
  const app = application(storage);
  await app.oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T-A');
  await app.oauth.handleUrl(app.callback());
  expect(app.connections.list()).toEqual([]);
  blocked = false;
  await app.oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T-A');
  await app.oauth.handleUrl(app.callback());
  await telemetry.shutdown();
  const error = events.find(event => event.event === '$exception')!;
  expect(error.properties).toMatchObject({ step: 'oauth.persist', code: 'EACCES', message: 'Keychain unavailable [path]' });
  expect(events.find(event => event.event === 'diagnostic_recovered')?.properties).toMatchObject({ episode_id: error.properties.episode_id });
  expect(events.filter(event => event.event === 'connection_completed').map(event => event.properties.outcome)).toEqual(['failed', 'success']);
});
it('retires in-flight setup and renewal linkage across opt-out without replay on re-enable', async () => {
  slack({ ok: true, team_id: 'T-A', team: 'Private workspace', user_id: 'U-A', user: 'Private user' });
  const app = application();
  await app.oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T-A');
  telemetry.setEnabled(false);
  telemetry.setEnabled(true);
  await app.oauth.handleUrl(app.callback());
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 11.5 * 60 * 60_000);
  let release!: () => void;
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { release = () => resolve(new Response(JSON.stringify({
    ok: true, token_type: 'user', access_token: 'renewed-access', refresh_token: 'renewed-refresh', expires_in: 43200,
  }))); })));
  const pending = app.oauth.renewDue();
  telemetry.setEnabled(false);
  telemetry.setEnabled(true);
  release();
  await pending;
  await telemetry.shutdown();
  expect(events).toEqual([]);
  expect(app.connections.activeTokens()).toEqual(['renewed-access']);
});
it('retains a rejected browser launch cause and differentiates expiry, supersession and denied consent', async () => {
  slack({ ok: true, team_id: 'T-A', user_id: 'U-A' });
  const app = application();
  const browser = new NativeSlackOAuth({ connections: app.connections, telemetry, exchange: exchangeSlackCode, verify: verifySlackToken,
    openExternal: async url => { throw Object.assign(new Error(`Cannot open ${url}`), { code: 'ENOENT' }); }, onConnected: () => {} });
  await browser.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T-A');
  await app.oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T-A');
  await app.oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T-A');
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 10 * 60_000);
  await app.oauth.handleUrl(app.callback());
  await telemetry.shutdown();
  expect(events.find(event => event.event === '$exception')?.properties).toMatchObject({ step: 'oauth.browser', code: 'ENOENT' });
  expect(events.filter(event => event.event === 'connection_completed').map(event => event.properties.reason)).toEqual(['technical_failure', 'superseded', 'expired']);
  expect(JSON.stringify(events)).not.toMatch(/https:|slack.com|code_challenge|client_id|T-A/);
});
it('preserves secure credential-read failures before the renewal cycle falls back to generic handling', async () => {
  slack({ ok: true, team_id: 'T-A', user_id: 'U-A' });
  let blocked = false;
  const storage = { ...encryption, decryptString: (value: Buffer) => {
    if (blocked) throw Object.assign(new Error('Keychain read denied'), { code: 'EACCES' });
    return encryption.decryptString(value);
  } };
  const app = application(storage);
  await app.oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T-A');
  await app.oauth.handleUrl(app.callback());
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 11.5 * 60 * 60_000);
  blocked = true;
  await expect(app.oauth.renewDue()).rejects.toThrow('Keychain read denied');
  blocked = false;
  await app.oauth.renewDue();
  await telemetry.shutdown();
  const error = events.find(event => event.event === '$exception' && event.properties.step === 'connection.credentials')!;
  expect(error?.properties).toMatchObject({ code: 'EACCES', message: 'Keychain read denied' });
  expect(events.find(event => event.event === 'diagnostic_recovered' && event.properties.episode_id === error.properties.episode_id)).toBeDefined();
});
it('keeps malformed credential responses technical without exporting parser excerpts', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{"access_token":"unknown-private-credential","user":"Private person", broken')));
  const app = application();
  await app.oauth.handleUrl('slack-status-bot://connect?client_id=1.1');
  await app.oauth.handleUrl(app.callback());
  await telemetry.shutdown();
  expect(events.find(event => event.event === '$exception')?.properties).toMatchObject({ step: 'oauth.exchange', code: 'invalid_json', http_status: 200 });
  expect(JSON.stringify(events)).not.toMatch(/unknown-private-credential|Private person|access_token/);
});
it('distinguishes authorization rejection from consent cancellation and recovers only after consent succeeds', async () => {
  slack({ ok: true, team_id: 'T-A', user_id: 'U-A' });
  const app = application();
  await app.oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T-A');
  await app.oauth.handleUrl(app.callback('error=invalid_scope'));
  await app.oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T-A');
  await app.oauth.handleUrl(app.callback('error=access_denied'));
  await app.oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T-A');
  await app.oauth.handleUrl(app.callback());
  await telemetry.shutdown();
  const error = events.find(event => event.event === '$exception')!;
  expect(error.properties).toMatchObject({ step: 'oauth.authorize', code: 'invalid_scope' });
  expect(error.properties.http_status).toBeUndefined();
  const recovery = events.find(event => event.event === 'diagnostic_recovered')!;
  const success = events.find(event => event.event === 'connection_completed' && event.properties.outcome === 'success')!;
  expect(recovery.properties).toMatchObject({ episode_id: error.properties.episode_id, recovery_operation_id: success.properties.operation_id });
  expect(events.filter(event => event.event === 'connection_completed').map(event => event.properties.outcome)).toEqual(['failed', 'cancelled', 'success']);
});
it('recognizes lost renewal authorization even when Slack returns an HTTP failure', async () => {
  slack({ ok: true, team_id: 'T-A', user_id: 'U-A' });
  const app = application();
  await app.oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T-A');
  await app.oauth.handleUrl(app.callback());
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 11.5 * 60 * 60_000);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'invalid_refresh_token' }), { status: 400 })));
  await app.oauth.renewDue();
  await telemetry.shutdown();
  expect(app.connections.list()[0].state).toBe('auth-required');
  expect(events.find(event => event.event === '$exception')?.properties).toMatchObject({ step: 'oauth.renew', code: 'invalid_refresh_token', http_status: 400 });
});
it('diagnoses an unreadable existing credential store without exporting JSON excerpts and recovers after a successful restore', async () => {
  const filename = path.join(directory, 'workspace-connections.json');
  fs.writeFileSync(filename, '[{"userName":"Private person","encryptedToken":"private-credential", broken');
  expect(() => application()).toThrow();
  fs.writeFileSync(filename, '[]');
  await application().connections.migrate();
  await telemetry.shutdown();
  const error = events.find(event => event.event === '$exception')!;
  expect(error?.properties).toMatchObject({ step: 'connection.restore', message: 'Invalid JSON in workspace connection store' });
  expect(events.find(event => event.event === 'diagnostic_recovered')?.properties).toMatchObject({ episode_id: error.properties.episode_id });
  expect(JSON.stringify(events)).not.toMatch(/Private person|private-credential|encryptedToken|userName/);
  expect(events.filter(event => event.event === 'connection_started' || event.event === 'connection_completed')).toEqual([]);
});
