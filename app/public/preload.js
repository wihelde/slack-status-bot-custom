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
   * Get current Slack status
   */
  getSlackStatus: () => ipcRenderer.invoke('get-slack-status'),

  /**
   * Get status of all sources
   */
  getSourceStatuses: () => ipcRenderer.invoke('get-source-statuses'),

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
   * Get daemon status
   */
  getDaemonStatus: () => ipcRenderer.invoke('get-daemon-status'),

  /**
   * Check if tokens are configured
   */
  getTokenStatus: () => ipcRenderer.invoke('get-tokens'),

  /**
   * On daemon status change
   */
  onDaemonStatusChange: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('daemon-status-changed', handler);
    return () => ipcRenderer.removeListener('daemon-status-changed', handler);
  },

  /**
   * On source status change
   */
  onSourceStatusChange: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('source-status-changed', handler);
    return () => ipcRenderer.removeListener('source-status-changed', handler);
  },

  /**
   * On Slack status change
   */
  onSlackStatusChange: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('slack-status-changed', handler);
    return () => ipcRenderer.removeListener('slack-status-changed', handler);
  },

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
   * Listen for status changes from daemon
   */
  onStatusChanged: (callback) => {
    const handler = (event, statusData) => callback(statusData);
    ipcRenderer.on('status-changed', handler);
    return () => ipcRenderer.removeListener('status-changed', handler);
  },

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
   * Check if this is the first run
   */
  isFirstRun: () => ipcRenderer.invoke('is-first-run'),

  /**
   * Mark first run as complete
   */
  completeFirstRun: () => ipcRenderer.invoke('complete-first-run'),

  /**
   * Listen for update available event
   */
  onUpdateAvailable: (callback) => {
    const handler = (event, updateInfo) => callback(updateInfo);
    ipcRenderer.on('update-available', handler);
    return () => ipcRenderer.removeListener('update-available', handler);
  },

  /**
   * Get current update availability status
   */
  getUpdateAvailable: () => ipcRenderer.invoke('get-update-available'),
});
