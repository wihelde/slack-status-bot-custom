import {
  AppDaemonSnapshot,
  AppSetupSnapshot,
  AppSnapshot,
  AppStatusSnapshot,
  AppUpdateSnapshot,
  AppSourcesSnapshot,
  AppSourceSnapshot,
  createDefaultDaemonSnapshot,
  createDefaultStatusSnapshot,
} from '../contracts/appSnapshot';
import { SOURCE_CATALOG, SourceName } from '../config/sourceCatalog';

type RawSourceStatuses = Partial<Record<SourceName, Omit<AppSourceSnapshot, 'name'>>>;

export interface AppSnapshotProviderDependencies {
  getSlackStatus: () => Promise<AppStatusSnapshot>;
  getSourceStatuses: () => Promise<RawSourceStatuses>;
  getDaemonSnapshot: () => AppDaemonSnapshot;
  getUpdateSnapshot: () => AppUpdateSnapshot | null;
  getSetupSnapshot: () => AppSetupSnapshot;
}

export class AppSnapshotProvider {
  constructor(private readonly dependencies: AppSnapshotProviderDependencies) {}

  async getSnapshot(): Promise<AppSnapshot> {
    const [status, rawSources] = await Promise.all([
      this.dependencies.getSlackStatus(),
      this.dependencies.getSourceStatuses(),
    ]);

    return {
      status,
      daemon: this.dependencies.getDaemonSnapshot(),
      sources: normalizeAppSourcesSnapshot(rawSources),
      update: this.dependencies.getUpdateSnapshot(),
      setup: this.dependencies.getSetupSnapshot(),
    };
  }
}

export function createAppSnapshotProvider(
  dependencies: AppSnapshotProviderDependencies
): AppSnapshotProvider {
  return new AppSnapshotProvider(dependencies);
}

export function normalizeAppSourcesSnapshot(
  sourceStatuses: RawSourceStatuses = {}
): AppSourcesSnapshot {
  return SOURCE_CATALOG.reduce((sources, source) => {
    sources[source.id] = {
      name: source.id,
      enabled: sourceStatuses[source.id]?.enabled ?? true,
      isActive: sourceStatuses[source.id]?.isActive ?? false,
      message: sourceStatuses[source.id]?.message,
    };
    return sources;
  }, {} as AppSourcesSnapshot);
}

export function createDefaultAppSnapshotSetup(
  overrides: Partial<AppSetupSnapshot> = {}
): AppSetupSnapshot {
  return {
    tokensConfigured: false,
    isFirstRun: false,
    ...overrides,
  };
}

export function createEmptyAppSnapshot(): AppSnapshot {
  return {
    status: createDefaultStatusSnapshot(),
    daemon: createDefaultDaemonSnapshot(),
    sources: normalizeAppSourcesSnapshot(),
    update: null,
    setup: createDefaultAppSnapshotSetup(),
  };
}
