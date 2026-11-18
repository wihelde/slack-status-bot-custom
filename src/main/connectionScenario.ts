import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createAppConfigStore, type AppConfigStore } from '../config/appConfigStore';
import { NativeSlackOAuth, exchangeSlackCode, refreshSlackToken } from './nativeSlackOAuth';
import { WorkspaceConnections, verifySlackToken } from './workspaceConnections';
import type { HostTelemetry } from './telemetry';

/** Explicit temporary-profile ingestion path; no browser or Slack request reaches an external service. */
export async function runConnectionScenario(telemetry: HostTelemetry, configStore: AppConfigStore) {
  assert.equal(telemetry.getSettings().enabled, true);
  assert.equal(telemetry.getSettings().environment, 'test');
  assert.equal(configStore.load().slackTokens.length, 0);
  const profile = fs.realpathSync(path.dirname(configStore.getConfigPath()));
  assert.ok(profile.startsWith(`${fs.realpathSync(os.tmpdir())}${path.sep}`), 'Temporary profile required');
  assert.equal(fs.existsSync(path.join(profile, 'workspace-connections.json')), false, 'Fresh profile without live connections required');
  const directory = path.join(profile, 'synthetic-connections');
  assert.equal(fs.existsSync(directory), false, 'Fresh synthetic connection directory required');
  const config = createAppConfigStore({ configDir: directory });
  let now = Date.now();
  let verificationAvailable = false;
  let renewal: 'broken' | 'success' | 'revoked' = 'broken';
  const request: typeof fetch = async (input, init) => {
    assert.equal(typeof input, 'string');
    if (input === 'https://slack.com/api/auth.test') {
      return new Response(JSON.stringify(verificationAvailable
        ? { ok: true, team_id: 'T123456789', user_id: 'U123456789', team: 'Synthetic private workspace', user: 'Synthetic private user' }
        : { ok: false, error: 'missing_scope', needed: 'users:read', provided: 'users:write', access_token: 'synthetic-access' }));
    }
    assert.equal(input, 'https://slack.com/api/oauth.v2.access');
    assert.ok(init?.body instanceof URLSearchParams);
    if (init.body.get('grant_type') === 'refresh_token') {
      if (renewal === 'broken') throw Object.assign(new Error('Synthetic renewal connection reset'), { code: 'ECONNRESET' });
      return new Response(JSON.stringify(renewal === 'revoked' ? { ok: false, error: 'invalid_refresh_token' }
        : { ok: true, token_type: 'user', access_token: 'synthetic-renewed', refresh_token: 'synthetic-refresh-renewed', expires_in: 43200 }));
    }
    return new Response(JSON.stringify({ ok: true, authed_user: {
      token_type: 'user', access_token: 'synthetic-access', refresh_token: 'synthetic-refresh', expires_in: 43200,
    } }));
  };
  const options = { directory, config, telemetry, verify: (token: string) => verifySlackToken(token, request),
    encryption: { isEncryptionAvailable: () => true, encryptString: (value: string) => Buffer.from(`synthetic:${value}`),
      decryptString: (value: Buffer) => value.toString().replace(/^synthetic:/, '') } };
  const connections = new WorkspaceConnections(options);
  let browserUrl = '';
  const oauth = new NativeSlackOAuth({ connections, telemetry, verify: options.verify,
    exchange: input => exchangeSlackCode(input, request), refresh: (client, token) => refreshSlackToken(client, token, request),
    openExternal: async url => { browserUrl = url; }, onConnected: () => {}, now: () => now });
  const start = () => oauth.handleUrl('slack-status-bot://connect?client_id=1.1&team_id=T123456789');
  const complete = (query = 'code=synthetic-code') => oauth.handleUrl(
    `slack-status-bot://oauth?state=${new URL(browserUrl).searchParams.get('state')}&${query}`);
  const started_at = new Date().toISOString();
  await start();
  await complete('error=access_denied');
  for (let attempt = 0; attempt < 2; attempt++) { await start(); await complete(); }
  assert.equal(connections.list().length, 0);
  verificationAvailable = true;
  await start();
  await complete();
  assert.equal(connections.list()[0].state, 'connected');
  await new WorkspaceConnections(options).migrate();
  now += 11.5 * 60 * 60_000;
  await oauth.renewDue();
  now += 60_000;
  await oauth.renewDue();
  assert.equal(connections.list()[0].refreshIssue, 'temporary');
  // Keep the shared real aggregation interval, including the normal SDK batch delay.
  await new Promise(resolve => setTimeout(resolve, 65_000));
  now += 60_000;
  renewal = 'success';
  await oauth.renewDue();
  assert.deepEqual(connections.activeTokens(now), ['synthetic-renewed']);
  now += 11.5 * 60 * 60_000;
  renewal = 'revoked';
  await oauth.renewDue();
  assert.equal(connections.list()[0].state, 'auth-required');
  await oauth.reconnect('T123456789');
  await complete();
  assert.equal(connections.list()[0].state, 'connected');
  assert.equal(configStore.load().slackTokens.length, 0);
  return { scenario: 'workspace_connections', started_at, finished_at: new Date().toISOString(),
    expected_completions: ['cancelled', 'failed', 'failed', 'success', 'success'],
    expected_flows: ['setup', 'setup', 'setup', 'setup', 'reconnect'],
    expected_renewals: ['retrying', 'retrying', 'renewed', 'reconnect_required'],
    expected_causes: ['missing_scope', 'ECONNRESET', 'invalid_refresh_token'],
    expected_occurrence_count: 2, live_slack_mutations: 0, live_authorizations: 0 };
}
