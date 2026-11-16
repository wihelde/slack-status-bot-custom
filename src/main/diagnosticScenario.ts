import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import type { AxiosAdapter } from 'axios';
import { SlackStatusBotDaemon } from '../daemon';
import type { AppConfigStore } from '../config/appConfigStore';
import { STATUS_MESSAGES } from '../config/statusConfig';
import type { HostTelemetry } from './telemetry';

/** Explicit test-only ingestion scenario. Every Slack request terminates at this in-process adapter. */
export async function runDiagnosticScenario(telemetry: HostTelemetry, configStore: AppConfigStore) {
  assert.equal(telemetry.getSettings().enabled, true, 'Synthetic diagnostics require explicit test collection');
  assert.equal(telemetry.getSettings().environment, 'test', 'Synthetic diagnostics require environment=test');
  assert.equal(configStore.load().slackTokens.length, 0, 'Synthetic diagnostics require an empty profile');
  const directory = fs.realpathSync(path.dirname(configStore.getConfigPath()));
  const temporaryRoot = fs.realpathSync(os.tmpdir());
  assert.ok(directory.startsWith(`${temporaryRoot}${path.sep}`), 'Synthetic diagnostics require a temporary profile');
  let broken = true;
  const profiles = new Map<string, unknown>();
  const slackAdapter: AxiosAdapter = async config => {
    const authorization = String(config.headers.Authorization);
    if (broken && authorization === 'Bearer synthetic-a' && config.url === '/users.profile.set') {
      throw Object.assign(new Error('Synthetic ECONNRESET status_text="Synthetic private content" token=synthetic-secret'), { code: 'ECONNRESET' });
    }
    if (config.url === '/users.profile.set') profiles.set(authorization, JSON.parse(config.data).profile);
    return { status: 200, statusText: 'OK', headers: {}, config,
      data: { ok: true, ...(config.url === '/users.profile.get' ? { profile: profiles.get(authorization) } : {}) } };
  };
  const daemon = new SlackStatusBotDaemon({ slackTokens: ['synthetic-a', 'synthetic-b'], configStore,
    telemetry, slackAdapter });
  const started_at = new Date().toISOString();
  const first = await daemon.setStatus(STATUS_MESSAGES.MEETING_EMOJI, 'Synthetic private content', 'dashboard');
  const second = await daemon.setStatus(STATUS_MESSAGES.MEETING_EMOJI, 'Synthetic private content', 'tray');
  assert.equal(first, false);
  assert.equal(second, false);
  // Exercise the real fixed summary interval, rather than forging a summary event.
  await new Promise(resolve => setTimeout(resolve, 65_000));
  broken = false;
  const recovered = await daemon.setStatus(STATUS_MESSAGES.MEETING_EMOJI, 'Synthetic private content', 'dashboard');
  assert.equal(recovered, true);
  return { scenario: 'manual_diagnostics', outcomes: ['partial', 'partial', 'success'],
    expected_events: ['status_operation', 'slack_request', '$exception', 'diagnostic_summary', 'diagnostic_recovered'],
    expected_cause: 'ECONNRESET', expected_occurrence_count: 2,
    original_source_frame: 'src/main/diagnosticScenario.ts',
    started_at, finished_at: new Date().toISOString(), live_slack_mutations: 0 };
}
