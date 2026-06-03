import type { CustomStatusConfig } from '../config/statusConfig';
import type { SourceName } from '../config/sourceCatalog';
import type { AppSnapshot, AppSnapshotRefreshSignal, AppStatusSnapshot } from './appSnapshot';

export type RendererLogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export const IPC_CHANNELS = {
  saveTokens: 'save-tokens',
  getTokens: 'get-tokens',
  deleteTokens: 'delete-tokens',
  getAppSnapshot: 'get-app-snapshot',
  setStatus: 'set-status',
  goOnline: 'go-online',
  goAway: 'go-away',
  toggleSource: 'toggle-source',
  setSourceOrder: 'set-source-order',
  getSourceOrder: 'get-source-order',
  getTokenStatus: 'get-token-status',
  getLogs: 'get-logs',
  clearLogs: 'clear-logs',
  setLogLevel: 'set-log-level',
  getLogLevel: 'get-log-level',
  getStatusConfiguration: 'get-status-configuration',
  updateStatusConfiguration: 'update-status-configuration',
  resetStatusConfiguration: 'reset-status-configuration',
  setHoliday: 'set-holiday',
  openHolidayModal: 'open-holiday-modal',
  setAutoLaunch: 'set-auto-launch',
  getAutoLaunch: 'get-auto-launch',
  completeFirstRun: 'complete-first-run',
  getSetupSnapshot: 'get-setup-snapshot',
} as const;

export const IPC_RENDERER_EVENTS = {
  appSnapshotChanged: 'app-snapshot-changed',
  openHolidayModal: 'open-holiday-modal',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export type StatusChangeEventStateValue =
  | AppStatusSnapshot['stateCheckValue']
  | 'activeSource'
  | 'sourceInactive';

export interface AppStatusChangedEvent {
  emoji: string;
  message: string;
  stateValue: StatusChangeEventStateValue;
}

export interface IpcSuccessResult<T> {
  success: true;
  data?: T;
  error?: string;
}

export interface IpcFailureResult {
  success: false;
  error?: string;
}

export type IpcResult<T = undefined> = IpcSuccessResult<T> | IpcFailureResult;

export interface TokenStatusPayload {
  configured: boolean;
}

export interface TokensPayload {
  tokens: string[];
  count: number;
}

export interface AutoLaunchStatusPayload {
  enabled: boolean;
  verified?: boolean;
}

export interface ElectronAPI {
  saveTokens: (tokens: string | string[]) => Promise<IpcResult>;
  getTokens: () => Promise<IpcResult<TokensPayload>>;
  deleteTokens: () => Promise<IpcResult>;
  getAppSnapshot: () => Promise<IpcResult<AppSnapshot>>;
  onAppSnapshotChanged: (
    callback: (signal: AppSnapshotRefreshSignal) => void
  ) => () => void;
  setStatus: (emoji: string, message: string) => Promise<IpcResult<boolean>>;
  goOnline: () => Promise<IpcResult<boolean>>;
  goAway: () => Promise<IpcResult<boolean>>;
  toggleSource: (source: SourceName, enabled: boolean) => Promise<IpcResult>;
  setSourceOrder: (sourceOrder: SourceName[]) => Promise<IpcResult>;
  getSourceOrder: () => Promise<IpcResult<SourceName[]>>;
  getTokenStatus: () => Promise<IpcResult<TokenStatusPayload>>;
  getLogs: (lines?: number) => Promise<IpcResult<string>>;
  clearLogs: () => Promise<IpcResult>;
  setLogLevel: (level: RendererLogLevel) => Promise<IpcResult<RendererLogLevel>>;
  getLogLevel: () => Promise<IpcResult<RendererLogLevel>>;
  getStatusConfiguration: () => Promise<IpcResult<CustomStatusConfig[]>>;
  updateStatusConfiguration: (config: CustomStatusConfig[]) => Promise<IpcResult>;
  resetStatusConfiguration: () => Promise<IpcResult>;
  setHoliday: (returnDate: string) => Promise<IpcResult<boolean>>;
  onOpenHolidayModal: (callback: () => void) => () => void;
  setAutoLaunch: (enabled: boolean) => Promise<IpcResult<AutoLaunchStatusPayload>>;
  getAutoLaunch: () => Promise<IpcResult<AutoLaunchStatusPayload>>;
  completeFirstRun: () => Promise<IpcResult>;
}
