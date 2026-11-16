import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { telemetryEvents, sourceName, automationContext, type TelemetryEvent, type DiagnosticContext } from './telemetryEvents';
import { diagnosticError, diagnosticFingerprint, sanitizeDiagnosticText, sanitizedFrames } from './diagnostics';
export { telemetryEvents, type TelemetryEvent } from './telemetryEvents';
import { PostHog, type PostHogOptions } from 'posthog-node';
import { z } from 'zod';
import type { AppConfigStore } from '../config/appConfigStore';
import { TELEMETRY_ENVIRONMENTS, type TelemetrySettings } from '../contracts/telemetry';

export const telemetryConfigurationSchema = z.object({
  environment: z.enum(TELEMETRY_ENVIRONMENTS),
  host: z.url().refine(value => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/';
  }),
  captureToken: z.string().regex(/^phc_[a-zA-Z0-9_]+$/),
});

type Options = {
  configStore: AppConfigStore;
  configuration: unknown;
  appVersion: string;
  autostartEnabled?: boolean;
  fetch?: PostHogOptions['fetch'];
  warn?: (message: string) => void;
};

/** Owns background activity and the only permitted outgoing analytics path in the host. */
export function createHostTelemetry(options: Options) {
  const config = options.configStore.load();
  const parsed = telemetryConfigurationSchema.safeParse(options.configuration);
  const configuration = parsed.success ? parsed.data : null;
  if (!configuration) options.warn?.('[Telemetry] Missing or invalid capture configuration; collection is unavailable.');
  let enabled = config.telemetryEnabled;
  let captureEpoch = 0;
  let autostartEnabled = options.autostartEnabled;
  let running = false;
  let stopped = false;
  let activityTimer: ReturnType<typeof setInterval> | undefined;
  let session: ReturnType<typeof createSession> | undefined;

  const episodes = new Map<string, { properties: ReturnType<typeof episodeProperties>; summarized: number }>();
  // One minute summaries, at most 100 active causes, no durable diagnostic journal.
  const diagnosticTimer = setInterval(() => {
    for (const episode of episodes.values()) {
      if (episode.properties.occurrence_count <= episode.summarized) continue;
      capture('diagnostic_summary', episode.properties);
      episode.summarized = episode.properties.occurrence_count;
    }
  }, 60_000);
  diagnosticTimer.unref?.();

  function episodeProperties(context: DiagnosticContext, error: unknown, sensitive: readonly string[]) {
    const { frames: _frames, ...technical } = diagnosticError(error, sensitive);
    return { ...technical, ...context, episode_id: randomUUID(), occurrence_count: 1,
      first_seen: new Date().toISOString(), last_seen: new Date().toISOString(),
      first_operation_id: context.operation_id, last_operation_id: context.operation_id };
  }

  function reportDiagnostic(error: unknown, context: DiagnosticContext, sensitive: readonly string[] = []) {
    if (!enabled || stopped || !configuration) return;
    const properties = episodeProperties(context, error, sensitive);
    const cause = { environment: configuration.environment, component: properties.component, step: properties.step,
      code: properties.code, message: properties.message,
      failure_kind: properties.failure_kind, exit_code: properties.exit_code, signal: properties.signal,
      network_code: properties.network_code, http_status: properties.http_status, location: sanitizedFrames(properties.stack)[0],
      needed_scopes: properties.needed_scopes, provided_scopes: properties.provided_scopes, fatal: properties.fatal };
    const key = diagnosticFingerprint({ ...cause, connection_ref: properties.connection_ref });
    const previous = episodes.get(key);
    if (previous) {
      previous.properties.occurrence_count++;
      previous.properties.last_seen = properties.last_seen;
      previous.properties.last_operation_id = context.operation_id;
      return;
    }
    if (episodes.size >= 100) episodes.delete(episodes.keys().next().value!);
    episodes.set(key, { properties, summarized: 1 });
    const frames = sanitizedFrames(properties.stack);
    // Build the documented exception envelope explicitly; SDK enrichment must never see a raw Error.
    capture('$exception', { ...properties,
      $exception_fingerprint: diagnosticFingerprint(cause),
      $exception_level: context.fatal ? 'fatal' : 'error',
      $exception_list: [{ type: properties.code ?? 'Error', value: properties.message,
        mechanism: { type: 'generic', handled: !context.fatal },
        ...(frames.length ? { stacktrace: { type: 'raw', frames } } : {}) }],
    });
  }

  function recoverDiagnostic(context: Pick<DiagnosticContext, 'component' | 'step' | 'connection_ref' | 'operation_id'>) {
    if (!enabled || stopped) return;
    for (const [key, episode] of episodes) {
      if (episode.properties.component !== context.component || episode.properties.step !== context.step ||
        episode.properties.connection_ref !== context.connection_ref) continue;
      capture('diagnostic_recovered', { ...episode.properties, recovery_operation_id: context.operation_id });
      episodes.delete(key);
    }
  }

  function createSession() {
    if (!configuration) return;
    let active = true;
    const controllers = new Set<AbortController>();
    const client = new PostHog(configuration.captureToken, {
      host: configuration.host,
      isServer: false,
      persistence: 'memory',
      disableGeoip: true,
      disableCompression: true,
      enableExceptionAutocapture: false,
      flushAt: 20,
      maxBatchSize: 20,
      maxQueueSize: 100,
      flushInterval: 5000,
      requestTimeout: 2000,
      fetchRetryCount: 1,
      fetchRetryDelay: 1000,
      before_send: event => {
        if (!active || !enabled || !Object.hasOwn(telemetryEvents, event.event)) return null;
        const properties = allowedProperties(event.event as TelemetryEvent, event.properties);
        if (!properties) return null;
        // Rebuild after SDK context enrichment so ambient properties also obey the allowlist.
        return { event: event.event, distinctId: `${configuration.environment}:${config.installationId}`,
          properties, disableGeoip: true };
      },
      fetch: async (url, init) => {
        // A retired SDK must never send its old queue, even after collection is re-enabled.
        if (!active) return { status: 200, text: async () => '', json: async () => ({}) };
        const controller = new AbortController();
        controllers.add(controller);
        try {
          const signal = AbortSignal.any([controller.signal, ...(init.signal ? [init.signal] : [])]);
          return await (options.fetch ?? fetch)(url, { ...init, signal });
        } finally {
          controllers.delete(controller);
        }
      },
    });
    // Transport errors stay local and never include request bodies, keys or recursive telemetry.
    client.on('error', () => options.warn?.('[Telemetry] Delivery unavailable; events may be lost.'));
    return {
      client,
      retire: () => {
        active = false;
        for (const controller of controllers) controller.abort();
        controllers.clear();
      },
    };
  }

  function capture<E extends TelemetryEvent>(event: E, properties: z.input<(typeof telemetryEvents)[E]>): void {
    if (!enabled || stopped || !configuration) return;
    try {
      const safe = allowedProperties(event, properties);
      if (!safe) return;
      session ??= createSession();
      session?.client.capture({
        event,
        distinctId: `${configuration.environment}:${config.installationId}`,
        properties: safe,
        disableGeoip: true,
      });
    } catch {
      options.warn?.('[Telemetry] Capture unavailable; event was dropped.');
    }
  }

  function allowedProperties(event: TelemetryEvent, properties: unknown) {
    if (!configuration || !Object.hasOwn(telemetryEvents, event)) return;
    const schema = telemetryEvents[event];
    const safe = schema?.safeParse(properties);
    if (!safe?.success) return;
    const data = safe.data;
    // Reapply redaction after schema validation and again at SDK output enrichment.
    if ('message' in data) data.message = sanitizeDiagnosticText(data.message);
    if ('stack' in data && data.stack) {
      data.stack = sanitizedFrames(data.stack).map(frame => `    at ${frame.filename}:${frame.lineno}:${frame.colno}`).join('\n');
    }
    const exceptionEvent = event === '$exception' ? telemetryEvents.$exception.safeParse(data) : null;
    if (exceptionEvent?.success) {
      Object.assign(data, { $exception_list: exceptionEvent.data.$exception_list });
      for (const exception of exceptionEvent.data.$exception_list) {
        exception.value = sanitizeDiagnosticText(exception.value);
      }
    }
    const settings = options.configStore.getDaemonSettings();
    const currentConfiguration = z.object(automationContext).parse({
      enabled_sources: sourceName.options.filter(source => settings.sources[source] !== false),
      source_priority: settings.sourceOrder, meeting_dnd: settings.meetingDnd,
      custom_status_count: settings.statusConfiguration.customStatuses.length + settings.statusConfiguration.offlineMessages.length,
    });
    return {
      ...currentConfiguration,
      ...data,
      environment: configuration.environment,
      app_version: options.appVersion,
      ...(autostartEnabled === undefined ? {} : { autostart_enabled: autostartEnabled }),
      os_platform: process.platform,
      os_release: os.release(),
      os_arch: process.arch,
      $process_person_profile: false,
    };
  }

  function getSettings(): TelemetrySettings {
    return { enabled, diagnosticId: config.installationId, environment: configuration?.environment ?? null };
  }

  return {
    capture,
    reportDiagnostic,
    recoverDiagnostic,
    // Operation links from before an opt-out must not reappear after re-enable.
    setAutostartContext: (enabled: boolean) => { autostartEnabled = enabled; },
    getCaptureEpoch: () => enabled && !stopped && configuration ? captureEpoch : null,
    getSettings,
    start() {
      if (running || stopped) return;
      running = true;
      capture('app_activity', { reason: 'startup' });
      activityTimer = setInterval(() => capture('app_activity', { reason: 'daily' }), 24 * 60 * 60 * 1000);
      activityTimer.unref?.();
    },
    setEnabled(value: boolean): TelemetrySettings {
      options.configStore.updateTelemetryEnabled(value);
      enabled = value;
      if (!enabled) {
        captureEpoch++;
        episodes.clear();
      }
      if (!enabled && session) {
        const discarded = session;
        session = undefined;
        discarded.retire();
        void discarded.client.disable().then(() => discarded.client.shutdown(0)).catch(() => {});
      }
      return getSettings();
    },
    async shutdown(): Promise<void> {
      if (stopped) return;
      stopped = true;
      clearInterval(activityTimer);
      clearInterval(diagnosticTimer);
      episodes.clear();
      const pending = session;
      session = undefined;
      if (!pending) return;
      try {
        await pending.client.shutdown(3000);
      } catch {
        // Delivery is best effort; shutdown must not fail the app.
      } finally {
        pending.retire();
      }
    },
  };
}

export type HostTelemetry = ReturnType<typeof createHostTelemetry>;

/** Runtime overrides are explicit, including an invalid/empty value; packaging never selects an environment. */
export function resolveTelemetryConfiguration(bundled: unknown, environment: NodeJS.ProcessEnv) {
  const defaults = z.object({
    environment: z.unknown().optional(), host: z.unknown().optional(), captureToken: z.unknown().optional(),
  }).safeParse(bundled);
  return {
    environment: environment.SLACK_STATUS_BOT_TELEMETRY_ENVIRONMENT ?? defaults.data?.environment,
    host: environment.SLACK_STATUS_BOT_POSTHOG_HOST ?? defaults.data?.host,
    captureToken: environment.SLACK_STATUS_BOT_POSTHOG_TOKEN ?? defaults.data?.captureToken,
  };
}
