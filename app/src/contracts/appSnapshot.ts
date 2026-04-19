import type { SourceName } from '../config/sourceCatalog';

export interface AppStatusSnapshot {
  emoji: string;
  text: string;
  stateCheckValue: string;
}

export interface AppDaemonSnapshot {
  running: boolean;
}

export interface AppSourceSnapshot {
  name: SourceName;
  enabled: boolean;
  isActive: boolean;
  message?: string;
}

export interface AppUpdateSnapshot {
  version: string;
  releaseDate: string;
}

export interface AppSetupSnapshot {
  tokensConfigured: boolean;
  isFirstRun: boolean;
}

export type AppSnapshotRefreshReason =
  | 'daemon-status'
  | 'source-status'
  | 'setup'
  | 'update'
  | 'manual';

export interface AppSnapshotRefreshSignal {
  reason: AppSnapshotRefreshReason;
}

export type AppSourcesSnapshot = Record<SourceName, AppSourceSnapshot>;

export interface AppSnapshot {
  status: AppStatusSnapshot;
  daemon: AppDaemonSnapshot;
  sources: AppSourcesSnapshot;
  update: AppUpdateSnapshot | null;
  setup: AppSetupSnapshot;
}

export function createDefaultStatusSnapshot(): AppStatusSnapshot {
  return {
    emoji: '',
    text: '',
    stateCheckValue: '',
  };
}

export function createDefaultDaemonSnapshot(): AppDaemonSnapshot {
  return {
    running: false,
  };
}

export function createDefaultSetupSnapshot(): AppSetupSnapshot {
  return {
    tokensConfigured: false,
    isFirstRun: false,
  };
}
