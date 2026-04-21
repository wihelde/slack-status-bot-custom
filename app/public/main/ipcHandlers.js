function maskTokens(tokens) {
  return Array.isArray(tokens)
    ? tokens.map(token => {
        if (token.length > 8) {
          return `${token.substring(0, 4)}...${token.substring(token.length - 4)}`;
        }

        return '****';
      })
    : [];
}

function createHandlerResult(callback) {
  return async (_event, ...args) => {
    try {
      return await callback(...args);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
}

function registerHandlerGroup(ipcMain, handlers) {
  Object.entries(handlers).forEach(([channel, handler]) => {
    ipcMain.handle(channel, createHandlerResult(handler));
  });
}

function registerSetupIpcHandlers(ipcMain, dependencies) {
  const {
    getConfig,
    saveTokens,
    deleteTokens,
    markFirstRunComplete,
    getSetupSnapshot,
  } = dependencies;

  registerHandlerGroup(ipcMain, {
    'get-tokens': async () => {
      const tokens = getConfig().slackTokens || [];
      return {
        success: true,
        data: {
          tokens: maskTokens(tokens),
          count: tokens.length,
        },
      };
    },
    'get-token-status': async () => {
      const tokens = getConfig().slackTokens || [];
      return {
        success: true,
        data: {
          configured: Array.isArray(tokens) ? tokens.length > 0 : Boolean(tokens),
        },
      };
    },
    'save-tokens': async tokens => {
      await saveTokens(tokens);
      return { success: true };
    },
    'delete-tokens': async () => {
      await deleteTokens();
      return { success: true };
    },
    'complete-first-run': async () => {
      await markFirstRunComplete();
      return { success: true };
    },
    'get-setup-snapshot': async () => ({
      success: true,
      data: getSetupSnapshot(),
    }),
  });
}

function registerStatusIpcHandlers(ipcMain, dependencies) {
  const {
    getDaemon,
    logStatusBridgeInfo,
    logStatusBridgeError,
    emitAppSnapshotChanged,
    refreshTrayMenu,
  } = dependencies;

  const requireDaemon = () => {
    const daemon = getDaemon();
    if (!daemon) {
      return null;
    }

    return daemon;
  };

  registerHandlerGroup(ipcMain, {
    'set-status': async (emoji, message) => {
      const daemon = requireDaemon();
      if (!daemon) {
        return { success: false, error: 'Daemon not initialized' };
      }

      logStatusBridgeInfo('Manual status update requested', { emoji, message });
      const success = await daemon.setStatus(emoji, message);
      return { success, data: success };
    },
    'go-online': async () => {
      const daemon = requireDaemon();
      if (!daemon) {
        return { success: false, error: 'Daemon not initialized' };
      }

      logStatusBridgeInfo('Go-online requested');
      const success = await daemon.goOnline();
      return { success, data: success };
    },
    'go-away': async () => {
      const daemon = requireDaemon();
      if (!daemon) {
        return { success: false, error: 'Daemon not initialized' };
      }

      logStatusBridgeInfo('Go-away requested');
      const success = await daemon.goAway();
      return { success, data: success };
    },
    'toggle-source': async (source, enabled) => {
      const daemon = requireDaemon();
      if (!daemon) {
        return { success: false, error: 'Daemon not initialized' };
      }

      daemon.toggleSource(source, enabled);
      emitAppSnapshotChanged('source-status');
      return { success: true };
    },
    'set-source-order': async sourceOrder => {
      const daemon = getDaemon();
      if (daemon) {
        await daemon.setSourceOrder(sourceOrder);
      } else {
        dependencies.updateSourceOrder(sourceOrder);
      }

      dependencies.refreshConfig();
      return { success: true };
    },
    'get-source-order': async () => ({
      success: true,
      data: getDaemon()?.getSourceOrder() || getConfigSourceOrder(dependencies.getConfig),
    }),
    'set-holiday': async returnDate => {
      const daemon = requireDaemon();
      if (!daemon) {
        return { success: false, error: 'Daemon not initialized' };
      }

      logStatusBridgeInfo('Holiday status requested', { returnDate });
      const success = await daemon.setHoliday(returnDate);
      return { success, data: success };
    },
    'get-status-configuration': async () => {
      const daemon = requireDaemon();
      if (!daemon) {
        return { success: false, error: 'Daemon not initialized' };
      }

      return { success: true, data: daemon.getStatusConfiguration() };
    },
    'update-status-configuration': async statusConfig => {
      const daemon = requireDaemon();
      if (!daemon) {
        return { success: false, error: 'Daemon not initialized' };
      }

      const success = await daemon.updateStatusConfiguration(statusConfig);
      if (success && daemon.statusManager && daemon.statusManager.setCustomStatuses) {
        daemon.statusManager.setCustomStatuses(statusConfig);
      }

      refreshTrayMenu();
      return { success };
    },
    'reset-status-configuration': async () => {
      const daemon = requireDaemon();
      if (!daemon) {
        return { success: false, error: 'Daemon not initialized' };
      }

      const success = await daemon.resetStatusConfiguration();
      refreshTrayMenu();
      return { success };
    },
    'open-holiday-modal': async () => {
      dependencies.openHolidayModal();
      return { success: true };
    },
  });
}

function getConfigSourceOrder(getConfig) {
  return getConfig().sourceOrder || ['spotify', 'appleMusic', 'zoom', 'teams', 'huddle'];
}

function registerSnapshotIpcHandlers(ipcMain, dependencies) {
  registerHandlerGroup(ipcMain, {
    'get-app-snapshot': async () => {
      const snapshot = await dependencies.getAppSnapshot();
      return { success: true, data: snapshot };
    },
  });
}

function registerLoggingIpcHandlers(ipcMain, dependencies) {
  registerHandlerGroup(ipcMain, {
    'get-logs': async (lines = 200) => ({
      success: true,
      data: dependencies.getLogs(lines),
    }),
    'clear-logs': async () => {
      dependencies.clearLogs();
      return { success: true };
    },
    'set-log-level': async level => {
      const nextLevel = dependencies.setLogLevel(level);
      return { success: true, data: nextLevel };
    },
    'get-log-level': async () => ({
      success: true,
      data: dependencies.getLogLevel(),
    }),
  });
}

function registerPlatformIpcHandlers(ipcMain, dependencies) {
  registerHandlerGroup(ipcMain, {
    'set-auto-launch': async enabled => ({
      success: true,
      data: await dependencies.setAutoLaunch(enabled),
    }),
    'get-auto-launch': async () => ({
      success: true,
      data: await dependencies.getAutoLaunch(),
    }),
  });
}

function registerMainIpcHandlers(ipcMain, dependencies) {
  registerSetupIpcHandlers(ipcMain, dependencies);
  registerStatusIpcHandlers(ipcMain, dependencies);
  registerSnapshotIpcHandlers(ipcMain, dependencies);
  registerLoggingIpcHandlers(ipcMain, dependencies);
  registerPlatformIpcHandlers(ipcMain, dependencies);
}

module.exports = {
  registerHandlerGroup,
  registerLoggingIpcHandlers,
  registerMainIpcHandlers,
  registerPlatformIpcHandlers,
  registerSetupIpcHandlers,
  registerSnapshotIpcHandlers,
  registerStatusIpcHandlers,
};
