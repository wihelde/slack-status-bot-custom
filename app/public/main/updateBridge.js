function isNewerVersion(newVersion, currentVersion) {
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

function createUpdateBridge({
  app,
  autoUpdater,
  isDev,
  log,
  emitAppSnapshotChanged,
  onUpdateAvailable,
  refreshTrayMenu,
  request,
  setIntervalFn,
}) {
  function applyUpdate(updateInfo) {
    onUpdateAvailable(updateInfo);
    emitAppSnapshotChanged('update');
    refreshTrayMenu();
  }

  function setupUpdateListeners() {
    log('[Updates] setupUpdateListeners() called');

    autoUpdater.on('update-available', updateInfo => {
      log(`[Updates] Event: update-available, version: ${updateInfo ? updateInfo.version : 'unknown'}`);
      applyUpdate({
        version: updateInfo.version,
        releaseDate: updateInfo.releaseDate,
      });
    });

    autoUpdater.on('update-not-available', () => {
      log('[Updates] Event: update-not-available');
    });

    autoUpdater.on('error', error => {
      log(`[Updates] Event: error, message: ${error ? error.message : 'unknown'}`);
    });

    autoUpdater.on('checking-for-update', () => {
      log('[Updates] Event: checking-for-update');
    });
  }

  function checkForUpdates() {
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
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode !== 200) {
              log(`[Updates] GitLab API error: ${res.statusCode}`);
              return;
            }

            const releases = JSON.parse(data);
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
            log(`[Updates] Error parsing releases: ${error.message}`);
          }
        });
      }
    );

    req.on('error', error => {
      log(`[Updates] Network error: ${error.message}`);
    });

    req.end();
  }

  function startScheduledChecks() {
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

module.exports = {
  createUpdateBridge,
  isNewerVersion,
};
