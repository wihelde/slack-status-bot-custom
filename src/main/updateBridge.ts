import type { AppUpdateSnapshot } from '../contracts/appSnapshot';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { releaseVersion } from '../contracts/telemetry';
import type { HostTelemetry } from './telemetry';
import type { telemetryEvents } from './telemetryEvents';

interface UpdateInfoPayload {
  version: string;
  releaseDate: string;
}

interface UpdateBridgeDependencies {
  getTelemetry?: () => HostTelemetry | null;
  app: {
    getVersion: () => string;
  };
  autoUpdater: {
    on: (event: string, callback: (payload?: unknown) => void) => unknown;
  };
  isDev: boolean;
  log: (message: string) => void;
  emitAppSnapshotChanged: (reason: 'update') => void;
  onUpdateAvailable: (update: AppUpdateSnapshot) => void;
  refreshTrayMenu: () => void;
  notifyUpdateAvailable?: (update: AppUpdateSnapshot) => void;
  request: (
    options: {
      hostname: string;
      path: string;
      method: 'GET';
      headers: Record<string, string>;
    },
    callback: (response: IncomingResponse) => void
  ) => OutgoingRequest;
  setIntervalFn: (callback: () => void, ms: number) => NodeJS.Timeout;
}

interface IncomingResponse {
  statusCode?: number;
  on: (event: 'data' | 'end', callback: (chunk?: string) => void) => void;
}

interface OutgoingRequest {
  on: (event: 'error', callback: (error: Error) => void) => void;
  end: () => void;
}

export interface UpdateBridge {
  checkForUpdates: () => void;
  setupUpdateListeners: () => void;
  startScheduledChecks: () => NodeJS.Timeout;
}

export function isNewerVersion(newVersion: string, currentVersion: string): boolean {
  const newParts = newVersion.split('.').map(Number);
  const currentParts = currentVersion.split('.').map(Number);

  for (let index = 0; index < Math.max(newParts.length, currentParts.length); index += 1) {
    const newPart = newParts[index] || 0;
    const currentPart = currentParts[index] || 0;

    if (newPart > currentPart) {
      return true;
    }

    if (newPart < currentPart) {
      return false;
    }
  }

  return false;
}

export function createUpdateBridge({
  app,
  autoUpdater,
  isDev,
  log,
  emitAppSnapshotChanged,
  onUpdateAvailable,
  refreshTrayMenu,
  notifyUpdateAvailable,
  request,
  setIntervalFn,
  getTelemetry,
}: UpdateBridgeDependencies): UpdateBridge {
  let updaterObservation: ReturnType<typeof beginCheck> | undefined;
  function beginCheck(provider: 'gitlab' | 'updater') {
    const telemetry = getTelemetry?.();
    const epoch = telemetry?.getCaptureEpoch();
    const started = Date.now();
    const check_id = randomUUID();
    let finished = false;
    return (properties: Omit<z.input<typeof telemetryEvents.update_check>, 'check_id' | 'provider' | 'duration_ms'>, error?: unknown) => {
      if (finished) return;
      finished = true;
      if (epoch == null || epoch !== telemetry?.getCaptureEpoch()) return;
      if (error !== undefined) telemetry.reportDiagnostic(error, { component: 'update', step: 'updater.check' });
      else if (provider === 'updater' && ['available', 'current'].includes(properties.outcome)) telemetry.recoverDiagnostic({ component: 'update', step: 'updater.check' });
      telemetry.capture('update_check', { ...properties, check_id, provider, duration_ms: Date.now() - started });
    };
  }
  function applyUpdate(updateInfo: UpdateInfoPayload): void {
    onUpdateAvailable(updateInfo);
    emitAppSnapshotChanged('update');
    refreshTrayMenu();
    notifyUpdateAvailable?.(updateInfo);
  }

  function setupUpdateListeners(): void {
    log('[Updates] setupUpdateListeners() called');

    autoUpdater.on('update-available', updateInfo => {
      const payload = updateInfo as UpdateInfoPayload | undefined;
      log(`[Updates] Event: update-available, version: ${payload ? payload.version : 'unknown'}`);
      if (payload) {
        (updaterObservation ?? beginCheck('updater'))({ outcome: 'available', reason: 'release_found', target_version: payload.version });
        updaterObservation = undefined;
        applyUpdate({
          version: payload.version,
          releaseDate: payload.releaseDate,
        });
      }
    });

    autoUpdater.on('update-not-available', () => {
      (updaterObservation ?? beginCheck('updater'))({ outcome: 'current', reason: 'up_to_date' });
      updaterObservation = undefined;
      log('[Updates] Event: update-not-available');
    });

    autoUpdater.on('error', error => {
      (updaterObservation ?? beginCheck('updater'))({ outcome: 'failed', reason: 'updater_error' }, error);
      updaterObservation = undefined;
      const payload = error as Error | undefined;
      log(`[Updates] Event: error, message: ${payload ? payload.message : 'unknown'}`);
    });

    autoUpdater.on('checking-for-update', () => {
      updaterObservation = beginCheck('updater');
      log('[Updates] Event: checking-for-update');
    });
  }

  function checkForUpdates(): void {
    const finish = beginCheck('gitlab');
    const telemetry = getTelemetry?.();
    const epoch = telemetry?.getCaptureEpoch();
    const diagnose = (error: unknown) => {
      if (epoch != null && epoch === telemetry?.getCaptureEpoch()) telemetry.reportDiagnostic(error, { component: 'update', step: 'gitlab.check' });
    };
    log('[Updates] checkForUpdates() called');

    if (isDev) {
      finish({ outcome: 'skipped', reason: 'development' });
      log('[Updates] Skipping update check in development mode');
      return;
    }

    const currentVersion = app.getVersion();
    log(`[Updates] Current version: ${currentVersion}`);
    log('[Updates] Checking GitLab for newer releases...');

    const req = request(
      {
        hostname: 'gitlab.com',
        path: '/api/v4/projects/22692225/releases',
        method: 'GET',
        headers: {
          'User-Agent': 'Slack Status Bot',
        },
      },
      res => {
        let data = '';

        res.on('data', chunk => {
          data += chunk || '';
        });

        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              finish({ outcome: 'failed', reason: 'http_error', http_status: res.statusCode });
              diagnose({ message: 'Release check HTTP error', response: { status: res.statusCode } });
              log(`[Updates] GitLab API error: ${res.statusCode}`);
              return;
            }

            const releases = z.array(z.object({ tag_name: z.string(), released_at: z.string().nullish() })).parse(JSON.parse(data));
            if (releases.length === 0) {
              finish({ outcome: 'skipped', reason: 'no_releases' });
              return;
            }

            const latestRelease = releases[0];
            const latestVersion = releaseVersion.parse(latestRelease.tag_name.replace(/^v/, ''));
            if (epoch != null && epoch === telemetry?.getCaptureEpoch()) telemetry.recoverDiagnostic({ component: 'update', step: 'gitlab.check' });
            log(`[Updates] Latest release found: ${latestVersion}`);

            if (isNewerVersion(latestVersion, currentVersion)) {
              finish({ outcome: 'available', reason: 'release_found', target_version: latestVersion });
              log(`[Updates] Update available: ${latestVersion}`);
              applyUpdate({
                version: latestVersion,
                releaseDate: latestRelease.released_at || new Date().toISOString(),
              });
              return;
            }

            log('[Updates] You are on the latest version');
            finish({ outcome: 'current', reason: 'up_to_date', target_version: latestVersion });
          } catch (error) {
            finish({ outcome: 'failed', reason: 'invalid_response' });
            // JSON/Zod errors can embed server response values; keep only the fixed failure category.
            diagnose(new Error('Invalid releases response'));
            const message = error instanceof Error ? error.message : String(error);
            log(`[Updates] Error parsing releases: ${message}`);
          }
        });
      }
    );

    req.on('error', error => {
      finish({ outcome: 'failed', reason: 'network_error' });
      diagnose(error);
      log(`[Updates] Network error: ${error.message}`);
    });

    req.end();
  }

  function startScheduledChecks(): NodeJS.Timeout {
    checkForUpdates();
    return setIntervalFn(() => {
      log('[App] Running scheduled update check...');
      checkForUpdates();
    }, 4 * 60 * 60 * 1000);
  }

  return {
    checkForUpdates,
    setupUpdateListeners,
    startScheduledChecks,
  };
}
