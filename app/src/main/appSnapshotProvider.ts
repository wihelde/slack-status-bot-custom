import {
  AppDaemonSnapshot,
  AppMetadataSnapshot,
  AppSetupSnapshot,
  AppSnapshot,
  AppStatusSnapshot,
  WorkspaceStatusSnapshot,
  AppUpdateSnapshot,
  AppSourcesSnapshot,
  AppSourceSnapshot,
  createDefaultAppMetadataSnapshot,
  createDefaultDaemonSnapshot,
  createDefaultSetupSnapshot,
  createDefaultStatusSnapshot,
} from '../contracts/appSnapshot';
import { SOURCE_CATALOG, SourceName } from '../config/sourceCatalog';

type RawSourceStatuses = Partial<Record<SourceName, Omit<AppSourceSnapshot, 'name'>>>;

export interface AppSnapshotProviderDependencies {
  getAppMetadataSnapshot: () => Partial<AppMetadataSnapshot> | null | undefined;
  getSlackStatus: () => Promise<Partial<AppStatusSnapshot> | null | undefined>;
  getSourceStatuses: () => Promise<RawSourceStatuses | null | undefined>;
  getWorkspaceStatuses?: () => Promise<WorkspaceStatusSnapshot[]>;
  getDaemonSnapshot: () => Partial<AppDaemonSnapshot> | null | undefined;
  getUpdateSnapshot: () => AppUpdateSnapshot | null | undefined;
  getSetupSnapshot: () => Partial<AppSetupSnapshot> | null | undefined;
}

export class AppSnapshotProvider {
  constructor(private readonly dependencies: AppSnapshotProviderDependencies) {}

  async getSnapshot(): Promise<AppSnapshot> {
    const [status, rawSources, workspaces] = await Promise.all([
      this.dependencies.getSlackStatus(),
      this.dependencies.getSourceStatuses(),
      this.dependencies.getWorkspaceStatuses?.(),
    ]);

    return {
      app: normalizeAppMetadataSnapshot(this.dependencies.getAppMetadataSnapshot()),
      status: normalizeAppStatusSnapshot(status),
      ...(workspaces ? { workspaces } : {}),
      daemon: normalizeAppDaemonSnapshot(this.dependencies.getDaemonSnapshot()),
      sources: normalizeAppSourcesSnapshot(rawSources),
      update: normalizeAppUpdateSnapshot(this.dependencies.getUpdateSnapshot()),
      setup: normalizeAppSetupSnapshot(this.dependencies.getSetupSnapshot()),
    };
  }
}

export function createAppSnapshotProvider(
  dependencies: AppSnapshotProviderDependencies
): AppSnapshotProvider {
  return new AppSnapshotProvider(dependencies);
}

export function normalizeAppSourcesSnapshot(
  sourceStatuses: RawSourceStatuses | null | undefined = {}
): AppSourcesSnapshot {
  return SOURCE_CATALOG.reduce((sources, source) => {
    const message = normalizeOptionalString(sourceStatuses?.[source.id]?.message);
    sources[source.id] = {
      name: source.id,
      enabled: sourceStatuses?.[source.id]?.enabled ?? true,
      isActive: sourceStatuses?.[source.id]?.isActive ?? false,
      ...(message ? { message } : {}),
    };
    return sources;
  }, {} as AppSourcesSnapshot);
}

export function normalizeAppStatusSnapshot(
  status: Partial<AppStatusSnapshot> | null | undefined
): AppStatusSnapshot {
  const fallback = createDefaultStatusSnapshot();

  return {
    emoji: normalizeRequiredString(status?.emoji, fallback.emoji),
    text: normalizeRequiredString(status?.text, fallback.text),
    stateCheckValue: normalizeRequiredString(
      status?.stateCheckValue,
      fallback.stateCheckValue
    ),
  };
}

export function normalizeAppMetadataSnapshot(
  appMetadata: Partial<AppMetadataSnapshot> | null | undefined
): AppMetadataSnapshot {
  const fallback = createDefaultAppMetadataSnapshot();

  return {
    version: normalizeRequiredString(appMetadata?.version, fallback.version),
  };
}

export function normalizeAppDaemonSnapshot(
  daemon: Partial<AppDaemonSnapshot> | null | undefined
): AppDaemonSnapshot {
  const fallback = createDefaultDaemonSnapshot();

  return {
    running: daemon?.running ?? fallback.running,
  };
}

export function normalizeAppSetupSnapshot(
  setup: Partial<AppSetupSnapshot> | null | undefined
): AppSetupSnapshot {
  const fallback = createDefaultSetupSnapshot();

  return {
    tokensConfigured: setup?.tokensConfigured ?? fallback.tokensConfigured,
    isFirstRun: setup?.isFirstRun ?? fallback.isFirstRun,
  };
}

export function normalizeAppUpdateSnapshot(
  update: AppUpdateSnapshot | null | undefined
): AppUpdateSnapshot | null {
  if (!update) {
    return null;
  }

  const version = normalizeOptionalString(update.version);
  if (!version) {
    return null;
  }

  return {
    version,
    releaseDate: normalizeRequiredString(update.releaseDate, ''),
  };
}

export function createEmptyAppSnapshot(): AppSnapshot {
  return {
    app: normalizeAppMetadataSnapshot(null),
    status: normalizeAppStatusSnapshot(null),
    daemon: normalizeAppDaemonSnapshot(null),
    sources: normalizeAppSourcesSnapshot(),
    update: null,
    setup: normalizeAppSetupSnapshot(null),
  };
}

function normalizeRequiredString(value: string | null | undefined, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
