import { z } from 'zod';
import { sanitizeDiagnosticText } from './diagnostics';
import { uiInteraction, updateInteraction, releaseVersion } from '../contracts/telemetry';
import { IPC_CHANNELS } from '../contracts/ipc';
const technicalName = z.string().max(80).refine(value => sanitizeDiagnosticText(value) === value);

const count = z.number().int().min(0).max(1_000_000_000);
const id = z.uuid();
const result = z.enum(['success', 'failed', 'skipped']);
export const entryPoint = z.enum(['dashboard', 'tray', 'external', 'unknown']);
export type EntryPoint = z.infer<typeof entryPoint>;
export const actionCategory = z.enum(['online', 'away', 'focus', 'meeting', 'break', 'holiday', 'travel', 'sick', 'remeet', 'dog', 'custom', 'external']);
export type ActionCategory = z.infer<typeof actionCategory>;
export const sourceName = z.enum(['spotify', 'appleMusic', 'youtubeMusic', 'zoom', 'teams', 'huddle']);
export const automationContext = {
  enabled_sources: z.array(sourceName).max(6).optional(),
  source_priority: z.array(sourceName).max(6).optional(),
  active_sources: z.array(sourceName).max(6).optional(),
  source_changes: z.array(z.object({ source: sourceName, change: z.enum(['activated', 'deactivated', 'message_changed']) })).max(6).optional(),
  winner: sourceName.optional(),
  rule_reason: z.enum(['protected', 'unchanged', 'cooldown', 'priority', 'missing_profile']).optional(),
  correction_reason: z.enum(['source-active', 'missing-profile', 'empty-status', 'empty-status-grace', 'empty-status-no-default', 'holiday-protected', 'holiday-expired', 'protected-status', 'overridable-third-party', 'custom-user-status', 'stale-source-status', 'invalid-day-status', 'valid-day-status']).optional(),
  decision: z.enum(['activated', 'message_changed', 'deactivated', 'reprioritized', 'correction']).optional(),
  meeting_dnd: z.boolean().optional(), custom_status_count: count.optional(), protected_status: z.boolean().optional(),
  user_owned: z.boolean().optional(),
};
const operationContext = {
  operation_id: id,
  trigger: z.enum(['manual', 'automatic', 'correction']),
  action: actionCategory.optional(),
  source: sourceName.optional(),
  entry_point: entryPoint.optional(),
};
const frame = z.object({ filename: z.string().max(180).regex(/^(?:src|dist|build)\/(?!.*\.\.)[a-zA-Z0-9_./-]+\.[cm]?[jt]sx?$/),
  function: z.literal('?').default('?'),
  platform: z.literal('node:javascript').default('node:javascript'),
  lineno: count, colno: count, in_app: z.boolean() });
const diagnostic = {
  ...automationContext,
  trigger: z.enum(['manual', 'automatic', 'correction']).optional(),
  operation_id: id.optional(),
  source: sourceName.optional(),
  failure_kind: z.enum(['command', 'parse', 'detector']).optional(),
  exit_code: z.number().int().min(-2147483648).max(2147483647).optional(),
  signal: z.string().regex(/^SIG[A-Z0-9]{1,20}$/).optional(),
  component: z.enum(['slack', 'runtime', 'source', 'connection', 'settings', 'renderer', 'update']),
  step: technicalName.regex(/^[a-zA-Z0-9_.:-]{1,80}$/),
  connection_ref: id.optional(),
  code: technicalName.regex(/^[a-zA-Z0-9_.:-]{1,80}$/).optional(),
  message: z.string().max(1000),
  stack: z.string().max(6000).optional(),
  http_status: z.number().int().min(100).max(599).optional(),
  network_code: z.string().regex(/^[A-Z0-9_]{1,50}$/).optional(),
  timeout: z.boolean().optional(), duration_ms: count.optional(), attempt: count.optional(),
  retry_after_seconds: count.optional(), rate_limited: z.boolean().optional(),
  needed_scopes: z.array(z.string().regex(/^[a-z_.]+:[a-z_.]+$/)).max(30).optional(),
  provided_scopes: z.array(z.string().regex(/^[a-z_.]+:[a-z_.]+$/)).max(30).optional(),
  fatal: z.boolean().optional(),
};
const episode = {
  ...diagnostic, episode_id: id, occurrence_count: count,
  first_seen: z.iso.datetime(), last_seen: z.iso.datetime(),
  first_operation_id: id.optional(), last_operation_id: id.optional(),
};
export const telemetryEvents = {
  ipc_failure: z.object({ channel: z.enum(Object.values(IPC_CHANNELS)) }),
  runtime_state: z.object({ reason: z.enum(['startup', 'daemon_started', 'daemon_stopped', 'resume', 'shutdown']),
    state: z.enum(['ready', 'unconfigured', 'failed', 'stopped']), duration_ms: count.optional() }),
  update_check: z.object({ check_id: id, provider: z.enum(['gitlab', 'updater']),
    outcome: z.enum(['available', 'current', 'failed', 'skipped']),
    reason: z.enum(['release_found', 'up_to_date', 'development', 'no_releases', 'http_error', 'network_error', 'invalid_response', 'updater_error']),
    target_version: releaseVersion.optional(), http_status: count.optional(), duration_ms: count }),
  update_interaction: updateInteraction,
  ui_interaction: uiInteraction,
  setup_input: z.object({ outcome: z.enum(['accepted', 'rejected']), reason: z.enum(['valid_link', 'invalid_link', 'invalid_registration', 'generation_failed']),
    entry_point: z.enum(['app', 'generator']) }),
  workspace_removed: z.object({ remaining_workspaces: count }),
  action_rejected: z.object({ action: z.enum(['set_status', 'online', 'away', 'holiday', 'source', 'configuration_read', 'configuration_update', 'configuration_reset']),
    reason: z.literal('daemon_unavailable'), entry_point: entryPoint }),
  process_health: z.object({ process_type: z.enum(['renderer', 'child']),
    outcome: z.enum(['gone', 'unresponsive', 'responsive', 'load_failed']),
    reason: z.enum(['clean-exit', 'abnormal-exit', 'killed', 'crashed', 'oom', 'launch-failed', 'integrity-failure', 'memory-eviction', 'unknown']).optional(),
    exit_code: z.number().int().optional() }),
  source_health_summary: z.object({ source: sourceName, window_id: id, window_started: z.iso.datetime(), window_ended: z.iso.datetime(),
    checks: count, active_checks: count, failed_checks: count, duration_total_ms: count, duration_max_ms: count,
    decisions: count, selected_checks: count, priority_blocked_checks: count, protected_checks: count, protection_unknown_checks: count, transitions: count }),
  performance_summary: z.object({ window_id: id, window_started: z.iso.datetime(), window_ended: z.iso.datetime(), samples: count,
    cpu_percent_total: z.number().finite().nonnegative(), cpu_percent_max: z.number().finite().nonnegative(),
    memory_mb_total: z.number().finite().nonnegative(), memory_mb_max: z.number().finite().nonnegative() }),
  automation_quality: z.object({ kind: z.enum(['manual_followed_automation', 'source_disabled_after_use', 'source_flapping']),
    source: sourceName.optional(), previous_operation_id: id.optional(), operation_id: id.optional(), elapsed_ms: count.optional(), transitions: count.optional() }),
  status_verification: z.object({ connection_ref: id, operation_id: id.optional(), phase: z.enum(['write_readback', 'observation']),
    result: z.enum(['match', 'mismatch', 'unavailable']), duration_ms: count }),
  connections_restored: z.object({ connected_workspaces: count, unverified_workspaces: count, authorization_required_workspaces: count }),
  connection_renewal: z.object({ operation_id: id, connection_ref: id,
    outcome: z.enum(['renewed', 'retrying', 'reconnect_required']), step: z.enum(['oauth.renew', 'oauth.renew.persist']), duration_ms: count }),
  connection_started: z.object({ operation_id: id, connection_ref: id, flow: z.enum(['setup', 'reconnect']) }),
  connection_completed: z.object({ operation_id: id, connection_ref: id, flow: z.enum(['setup', 'reconnect']),
    outcome: z.enum(['success', 'failed', 'cancelled']), step: z.enum(['oauth.browser', 'oauth.authorize', 'oauth.exchange', 'oauth.verify', 'oauth.persist']),
    reason: z.enum(['connected', 'technical_failure', 'access_denied', 'expired', 'superseded', 'removed', 'invalid_callback']),
    duration_ms: count, replaced_existing: z.boolean().optional(), first_connection: z.boolean().optional() }),
  app_activity: z.object({ reason: z.enum(['startup', 'daily']) }),
  status_operation: z.object({ ...operationContext, ...automationContext,
    outcome: z.enum(['success', 'partial', 'failed', 'skipped']),
    reason: z.enum(['delivered', 'delivery_failed', 'no_workspaces', 'invalid_action', 'protected', 'unchanged', 'cooldown', 'priority', 'missing_profile', 'unexpected_error']),
    targeted_workspaces: count, successful_workspaces: count, duration_ms: count, end_to_end_ms: count.optional(), queue_wait_ms: count.optional(),
    workspace_results: z.array(z.object({ connection_ref: id,
      profile: result.optional(), presence: result.optional(), dnd: result.optional() })).max(100),
  }),
  slack_request: z.object({ operation_id: id.optional(), connection_ref: id,
    step: z.enum(['users.profile.set', 'users.setPresence', 'dnd.setSnooze', 'dnd.endDnd']),
    result, attempt: count, duration_ms: count, reason: z.enum(['delivered', 'api_error', 'rate_limit_backoff']) }),
  settings_changed: z.object({ setting: z.enum(['autostart', 'custom_statuses', 'source', 'source_priority', 'meeting_dnd']),
    source: sourceName.optional(), source_priority: z.array(sourceName).max(6).optional(),
    enabled: z.boolean().optional(), custom_status_count: count.optional(), reset: z.boolean().optional() }),
  $exception: z.object({ ...episode,
    $exception_level: z.enum(['error', 'fatal']).default('error'),
    $exception_list: z.array(z.object({ type: technicalName, value: z.string().max(1000),
      mechanism: z.object({ type: z.literal('generic'), handled: z.boolean() }),
      stacktrace: z.object({ type: z.literal('raw'), frames: z.array(frame).max(30) }).optional(),
    })).max(1),
    $exception_fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  diagnostic_summary: z.object(episode),
  diagnostic_recovered: z.object({ ...episode, recovery_operation_id: id.optional(), recovery_duration_ms: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional() }),
};
export type ConnectionStep = z.input<typeof telemetryEvents.connection_completed>['step'];
export type RenewalStep = z.input<typeof telemetryEvents.connection_renewal>['step'];
export type TelemetryEvent = keyof typeof telemetryEvents;
export type DiagnosticContext = Omit<z.input<typeof telemetryEvents.diagnostic_summary>,
  'episode_id' | 'occurrence_count' | 'first_seen' | 'last_seen' | 'first_operation_id' | 'last_operation_id' | 'message' | 'stack'>;
