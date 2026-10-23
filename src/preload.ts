import { contextBridge, ipcRenderer } from 'electron';
import type { AppSnapshotRefreshSignal } from './contracts/appSnapshot';
import { IPC_CHANNELS, IPC_RENDERER_EVENTS, type ElectronAPI } from './contracts/ipc';

const electronAPI: ElectronAPI = {
  saveTokens: tokens => ipcRenderer.invoke(IPC_CHANNELS.saveTokens, tokens),
  getTokens: () => ipcRenderer.invoke(IPC_CHANNELS.getTokens),
  openSetupLink: link => ipcRenderer.invoke(IPC_CHANNELS.openSetupLink, link),
  reconnectWorkspace: teamId => ipcRenderer.invoke(IPC_CHANNELS.reconnectWorkspace, teamId),
  removeWorkspace: teamId => ipcRenderer.invoke(IPC_CHANNELS.removeWorkspace, teamId),
  deleteTokens: () => ipcRenderer.invoke(IPC_CHANNELS.deleteTokens),
  getAppSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.getAppSnapshot),
  onAppSnapshotChanged: callback => {
    const handler = (_event: unknown, signal: AppSnapshotRefreshSignal) => callback(signal);
    ipcRenderer.on(IPC_RENDERER_EVENTS.appSnapshotChanged, handler);
    return () => ipcRenderer.removeListener(IPC_RENDERER_EVENTS.appSnapshotChanged, handler);
  },
  setStatus: (emoji, message) => ipcRenderer.invoke(IPC_CHANNELS.setStatus, emoji, message),
  goOnline: () => ipcRenderer.invoke(IPC_CHANNELS.goOnline),
  goAway: () => ipcRenderer.invoke(IPC_CHANNELS.goAway),
  toggleSource: (source, enabled) => ipcRenderer.invoke(IPC_CHANNELS.toggleSource, source, enabled),
  setSourceOrder: sourceOrder => ipcRenderer.invoke(IPC_CHANNELS.setSourceOrder, sourceOrder),
  getMeetingDnd: () => ipcRenderer.invoke(IPC_CHANNELS.getMeetingDnd),
  setMeetingDnd: enabled => ipcRenderer.invoke(IPC_CHANNELS.setMeetingDnd, enabled),
  getSourceOrder: () => ipcRenderer.invoke(IPC_CHANNELS.getSourceOrder),
  getTokenStatus: () => ipcRenderer.invoke(IPC_CHANNELS.getTokenStatus),
  getLogs: (lines = 200) => ipcRenderer.invoke(IPC_CHANNELS.getLogs, lines),
  clearLogs: () => ipcRenderer.invoke(IPC_CHANNELS.clearLogs),
  setLogLevel: level => ipcRenderer.invoke(IPC_CHANNELS.setLogLevel, level),
  getLogLevel: () => ipcRenderer.invoke(IPC_CHANNELS.getLogLevel),
  getStatusConfiguration: () => ipcRenderer.invoke(IPC_CHANNELS.getStatusConfiguration),
  updateStatusConfiguration: config =>
    ipcRenderer.invoke(IPC_CHANNELS.updateStatusConfiguration, config),
  resetStatusConfiguration: () => ipcRenderer.invoke(IPC_CHANNELS.resetStatusConfiguration),
  setHoliday: returnDate => ipcRenderer.invoke(IPC_CHANNELS.setHoliday, returnDate),
  onOpenHolidayModal: callback => {
    const handler = () => callback();
    ipcRenderer.on(IPC_RENDERER_EVENTS.openHolidayModal, handler);
    return () => ipcRenderer.removeListener(IPC_RENDERER_EVENTS.openHolidayModal, handler);
  },
  setAutoLaunch: enabled => ipcRenderer.invoke(IPC_CHANNELS.setAutoLaunch, enabled),
  getAutoLaunch: () => ipcRenderer.invoke(IPC_CHANNELS.getAutoLaunch),
  completeFirstRun: () => ipcRenderer.invoke(IPC_CHANNELS.completeFirstRun),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
