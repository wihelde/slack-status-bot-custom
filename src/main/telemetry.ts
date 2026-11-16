import os from 'node:os';
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

// Extend this allowlist for agreed events. Unknown fields are stripped, including SDK control properties.
export const telemetryEvents = {
  app_activity: z.object({ reason: z.enum(['startup', 'daily']) }),
};
export type TelemetryEvent = keyof typeof telemetryEvents;

type Options = {
  configStore: AppConfigStore;
  configuration: unknown;
  appVersion: string;
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
  let running = false;
  let stopped = false;
  let activityTimer: ReturnType<typeof setInterval> | undefined;
  let session: ReturnType<typeof createSession> | undefined;

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
    const safe = allowedProperties(event, properties);
    if (!safe) return;
    try {
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
    return {
      ...safe.data,
      environment: configuration.environment,
      app_version: options.appVersion,
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
