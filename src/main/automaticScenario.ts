import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import type { AxiosAdapter } from 'axios';
import { SlackStatusBotDaemon } from '../daemon';
import { DEFAULT_SOURCE_ORDER } from '../config/sourceCatalog';
import type { AppConfigStore } from '../config/appConfigStore';
import type { HostTelemetry } from './telemetry';

/** Explicit compiled-host test path. Sources and every Slack request terminate in injected adapters. */
export async function runAutomaticScenario(telemetry: HostTelemetry, configStore: AppConfigStore) {
  assert.equal(process.platform, 'darwin', 'The synthetic source scenario targets the macOS probes');
  assert.equal(telemetry.getSettings().enabled, true);
  assert.equal(telemetry.getSettings().environment, 'test', 'Synthetic automation requires environment=test');
  assert.equal(configStore.load().slackTokens.length, 0, 'Synthetic automation requires an empty profile');
  const directory = fs.realpathSync(path.dirname(configStore.getConfigPath()));
  assert.ok(directory.startsWith(`${fs.realpathSync(os.tmpdir())}${path.sep}`), 'Synthetic automation requires a temporary profile');
  let profile = { status_emoji: '', status_text: '', status_expiration: 0 };
  let partial = true;
  let failedProbe = false;
  const slackAdapter: AxiosAdapter = async config => {
    const failed = partial && String(config.headers.Authorization) === 'Bearer synthetic-a' && config.url === '/users.profile.set';
    if (config.url === '/users.profile.set' && !failed) profile = JSON.parse(config.data).profile;
    return { config, status: 200, statusText: 'OK', headers: {}, data: failed
      ? { ok: false, error: 'missing_scope', needed: 'users.profile:write' }
      : { ok: true, ...(config.url === '/users.profile.get' ? { profile } : {}) } };
  };
  const daemon = new SlackStatusBotDaemon({ slackTokens: ['synthetic-a', 'synthetic-b'], telemetry, configStore, slackAdapter,
    sourceCommandRunner: async () => {
      if (failedProbe) throw Object.assign(new Error('Command failed: Synthetic private command'), {
        code: 2, signal: 'SIGTERM', stderr: 'lsof: Permission denied /Users/synthetic/private\nSynthetic private track',
        stdout: 'Synthetic private process 192.0.2.1',
      });
      return { stdout: 'zoom UDP 127.0.0.1:5000', stderr: '' };
    } });
  for (const source of DEFAULT_SOURCE_ORDER) daemon.toggleSource(source, source === 'zoom');
  const started_at = new Date().toISOString();
  await daemon.setSourceOrder(DEFAULT_SOURCE_ORDER); // Actual partial source delivery.
  partial = false;
  await daemon.setSourceOrder(DEFAULT_SOURCE_ORDER); // Full delivery and Slack-step recovery.
  assert.equal(await daemon.setHoliday('30.12.2099'), true);
  await daemon.setSourceOrder(DEFAULT_SOURCE_ORDER); // Protected skip, without requests.
  failedProbe = true;
  await daemon.getSourceStatuses();
  await daemon.getSourceStatuses();
  await new Promise(resolve => setTimeout(resolve, 65_000)); // Shared real diagnostic summary tick.
  failedProbe = false;
  await daemon.getSourceStatuses(); // Actual active probe recovery, despite protected Shared Status.
  return { scenario: 'automatic_sources', started_at, finished_at: new Date().toISOString(),
    expected_automatic_outcomes: ['partial', 'success', 'skipped'], expected_source: 'zoom',
    expected_probe_step: 'zoom.network', expected_probe_occurrences: 2,
    expected_events: ['status_operation', 'slack_request', '$exception', 'diagnostic_summary', 'diagnostic_recovered'],
    live_slack_mutations: 0, real_source_commands: 0 };
}
