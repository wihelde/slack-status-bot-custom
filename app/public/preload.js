const { contextBridge, ipcRenderer } = require('electron');

/**
 * Expose safe API to renderer process
 */
contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Save Slack tokens
   */
  saveTokens: (tokens) => ipcRenderer.invoke('save-tokens', tokens),

  /**
   * Get stored tokens (masked)
   */
  getTokens: () => ipcRenderer.invoke('get-tokens'),

  /**
   * Delete all tokens
   */
  deleteTokens: () => ipcRenderer.invoke('delete-tokens'),

  /**
   * Get the consolidated app snapshot for renderer bootstrap.
   */
  getAppSnapshot: () => ipcRenderer.invoke('get-app-snapshot'),

  /**
   * Listen for renderer-facing runtime changes and reload via the canonical app snapshot.
   */
  onAppSnapshotChanged: (callback) => {
    const handler = (event, signal) => callback(signal);
    ipcRenderer.on('app-snapshot-changed', handler);
    return () => ipcRenderer.removeListener('app-snapshot-changed', handler);
  },

  /**
   * Set custom status
   */
  setStatus: (emoji, message) => ipcRenderer.invoke('set-status', emoji, message),

  /**
   * Go online
   */
  goOnline: () => ipcRenderer.invoke('go-online'),

  /**
   * Go away
   */
  goAway: () => ipcRenderer.invoke('go-away'),

  /**
   * Toggle monitoring of a source
   * @param {string} source - 'spotify', 'appleMusic', 'zoom', 'teams', 'huddle'
   * @param {boolean} enabled
   */
  toggleSource: (source, enabled) => ipcRenderer.invoke('toggle-source', source, enabled),
  setSourceOrder: (sourceOrder) => ipcRenderer.invoke('set-source-order', sourceOrder),
  getSourceOrder: () => ipcRenderer.invoke('get-source-order'),

  /**
   * Check if tokens are configured
   */
  getTokenStatus: () => ipcRenderer.invoke('get-tokens'),

  /**
   * Get recent logs
   */
  getLogs: (lines = 200) => ipcRenderer.invoke('get-logs', lines),

  /**
   * Clear logs
   */
  clearLogs: () => ipcRenderer.invoke('clear-logs'),

  /**
   * Set log level
   */
  setLogLevel: (level) => ipcRenderer.invoke('set-log-level', level),

  /**
   * Get current log level
   */
  getLogLevel: () => ipcRenderer.invoke('get-log-level'),

  /**
   * Get status configuration
   */
  getStatusConfiguration: () => ipcRenderer.invoke('get-status-configuration'),

  /**
   * Update status configuration
   */
  updateStatusConfiguration: (config) => ipcRenderer.invoke('update-status-configuration', config),

  /**
   * Reset status configuration to defaults
   */
  resetStatusConfiguration: () => ipcRenderer.invoke('reset-status-configuration'),

  /**
   * Set holiday status with return date
   */
  setHoliday: (returnDate) => ipcRenderer.invoke('set-holiday', returnDate),

  /**
   * Listen for open-holiday-modal event
   */
  onOpenHolidayModal: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('open-holiday-modal', handler);
    return () => ipcRenderer.removeListener('open-holiday-modal', handler);
  },

  /**
   * Set auto-launch on startup
   */
  setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),

  /**
   * Get auto-launch status
   */
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),

  /**
   * Mark first run as complete
   */
  completeFirstRun: () => ipcRenderer.invoke('complete-first-run'),
});
