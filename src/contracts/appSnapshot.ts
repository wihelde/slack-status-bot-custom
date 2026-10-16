import type { SourceName } from '../config/sourceCatalog';

export interface AppStatusSnapshot {
  emoji: string;
  text: string;
  stateCheckValue: string;
}

export interface WorkspaceStatusSnapshot {
  teamId: string | null;
  teamName: string | null;
  userName: string | null;
  health: 'reachable' | 'unavailable';
  profile: { status_emoji: string; status_text: string; status_expiration?: number } | null;
  delivery: {
    profile?: 'delivered' | 'failed';
    presence?: 'delivered' | 'failed';
    dnd?: 'delivered' | 'failed';
  };
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

export interface AppMetadataSnapshot {
  version: string;
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
  app: AppMetadataSnapshot;
  status: AppStatusSnapshot;
  workspaces?: WorkspaceStatusSnapshot[];
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

export function createDefaultAppMetadataSnapshot(): AppMetadataSnapshot {
  return {
    version: '',
  };
}
