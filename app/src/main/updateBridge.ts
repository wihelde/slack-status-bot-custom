import type { AppUpdateSnapshot } from '../contracts/appSnapshot';

interface UpdateInfoPayload {
  version: string;
  releaseDate: string;
}

interface ReleasePayload {
  tag_name: string;
  released_at?: string;
}

interface UpdateBridgeDependencies {
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
  request,
  setIntervalFn,
}: UpdateBridgeDependencies): UpdateBridge {
  function applyUpdate(updateInfo: UpdateInfoPayload): void {
    onUpdateAvailable(updateInfo);
    emitAppSnapshotChanged('update');
    refreshTrayMenu();
  }

  function setupUpdateListeners(): void {
    log('[Updates] setupUpdateListeners() called');

    autoUpdater.on('update-available', updateInfo => {
      const payload = updateInfo as UpdateInfoPayload | undefined;
      log(`[Updates] Event: update-available, version: ${payload ? payload.version : 'unknown'}`);
      if (payload) {
        applyUpdate({
          version: payload.version,
          releaseDate: payload.releaseDate,
        });
      }
    });

    autoUpdater.on('update-not-available', () => {
      log('[Updates] Event: update-not-available');
    });

    autoUpdater.on('error', error => {
      const payload = error as Error | undefined;
      log(`[Updates] Event: error, message: ${payload ? payload.message : 'unknown'}`);
    });

    autoUpdater.on('checking-for-update', () => {
      log('[Updates] Event: checking-for-update');
    });
  }

  function checkForUpdates(): void {
    log('[Updates] checkForUpdates() called');

    if (isDev) {
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
              log(`[Updates] GitLab API error: ${res.statusCode}`);
              return;
            }

            const releases = JSON.parse(data) as ReleasePayload[];
            if (!Array.isArray(releases) || releases.length === 0) {
              return;
            }

            const latestRelease = releases[0];
            const latestVersion = latestRelease.tag_name.replace(/^v/, '');
            log(`[Updates] Latest release found: ${latestVersion}`);

            if (isNewerVersion(latestVersion, currentVersion)) {
              log(`[Updates] Update available: ${latestVersion}`);
              applyUpdate({
                version: latestVersion,
                releaseDate: latestRelease.released_at || new Date().toISOString(),
              });
              return;
            }

            log('[Updates] You are on the latest version');
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            log(`[Updates] Error parsing releases: ${message}`);
          }
        });
      }
    );

    req.on('error', error => {
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
