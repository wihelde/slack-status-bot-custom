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
    ipcRenderer.on('daemon-status-changed', (event, data) => callback(data));
  },

  /**
   * On source status change
   */
  onSourceStatusChange: (callback) => {
    ipcRenderer.on('source-status-changed', (event, data) => callback(data));
  },

  /**
   * On Slack status change
   */
  onSlackStatusChange: (callback) => {
    ipcRenderer.on('slack-status-changed', (event, data) => callback(data));
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
   * Set holiday status with return date
   */
  setHoliday: (returnDate) => ipcRenderer.invoke('set-holiday', returnDate),

  /**
   * Listen for status changes from daemon
   */
  onStatusChanged: (callback) => {
    ipcRenderer.on('status-changed', (event, statusData) => callback(statusData));
  },
});
