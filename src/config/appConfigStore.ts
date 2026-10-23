import fs from 'fs';
import path from 'path';
import { DEFAULT_SOURCE_ORDER, SourceName } from './sourceCatalog';
import {
  DEFAULT_OVERRIDABLE_PATTERNS,
  getDefaultStatusConfiguration,
  STATUS_MESSAGES,
  StatusConfiguration,
} from './statusConfig';
import type { CustomStatusConfig, OverridableStatusPattern } from './statusConfig';
import type { LogLevel } from '../utils/logger';

const CONFIG_FILE_NAME = 'config.json';
const MANAGED_KEYS = new Set([
  'slackTokens',
  'sources',
  'meetingDnd',
  'sourceOrder',
  'statusConfiguration',
  'hasCompletedFirstRun',
  'logLevel',
  'lastUpdated',
]);
const VALID_LOG_LEVELS: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

export interface PersistedAppConfig {
  meetingDnd: boolean;
  slackTokens: string[];
  sources: Record<SourceName, boolean>;
  sourceOrder: SourceName[];
  statusConfiguration: StatusConfiguration;
  hasCompletedFirstRun: boolean;
  logLevel: LogLevel;
  lastUpdated?: string;
}

export interface DaemonPersistedSettings {
  meetingDnd: boolean;
  sources: Record<SourceName, boolean>;
  sourceOrder: SourceName[];
  statusConfiguration: StatusConfiguration;
}

interface LoadedConfigState {
  config: PersistedAppConfig;
  extras: Record<string, unknown>;
  shouldPersist: boolean;
}

export interface ConfigRecovery {
  configPath: string;
  backupPath: string | null;
  reason: string;
}

interface AppConfigStoreOptions {
  configDir: string;
  onConfigRecovery?: (recovery: ConfigRecovery) => void;
}

export class AppConfigStore {
  private readonly configDir: string;
  private readonly onConfigRecovery?: (recovery: ConfigRecovery) => void;

  constructor(options: AppConfigStoreOptions) {
    this.configDir = options.configDir;
    this.onConfigRecovery = options.onConfigRecovery;
  }

  getConfigPath(): string {
    return path.join(this.configDir, CONFIG_FILE_NAME);
  }

  load(): PersistedAppConfig {
    const state = this.loadState();

    if (state.shouldPersist) {
      return this.writeConfig(state.config, state.extras);
    }

    return state.config;
  }

  getDaemonSettings(): DaemonPersistedSettings {
    const config = this.load();
    return {
      meetingDnd: config.meetingDnd,
      sources: { ...config.sources },
      sourceOrder: [...config.sourceOrder],
      statusConfiguration: cloneStatusConfiguration(config.statusConfiguration),
    };
  }

  updateSlackTokens(tokens: string[]): PersistedAppConfig {
    return this.update(config => ({
      ...config,
      slackTokens: [...tokens],
    }));
  }

  clearSlackTokens(): PersistedAppConfig {
    return this.update(config => ({
      ...config,
      slackTokens: [],
    }));
  }

  updateSourceOrder(sourceOrder: SourceName[]): PersistedAppConfig {
    return this.update(config => ({
      ...config,
      sourceOrder: normalizeSourceOrder(sourceOrder),
    }));
  }

  updateLogLevel(logLevel: LogLevel): PersistedAppConfig {
    return this.update(config => ({
      ...config,
      logLevel: normalizeLogLevel(logLevel),
    }));
  }

  markFirstRunCompleted(): PersistedAppConfig {
    return this.update(config => ({
      ...config,
      hasCompletedFirstRun: true,
    }));
  }

  updateDaemonSettings(settings: Partial<DaemonPersistedSettings>): PersistedAppConfig {
    return this.update(config => ({
      ...config,
      meetingDnd: settings.meetingDnd ?? config.meetingDnd,
      sources: settings.sources ? normalizeSources(settings.sources) : config.sources,
      sourceOrder: settings.sourceOrder ? normalizeSourceOrder(settings.sourceOrder) : config.sourceOrder,
      statusConfiguration: settings.statusConfiguration
        ? normalizeStatusConfiguration(settings.statusConfiguration)
        : config.statusConfiguration,
    }));
  }

  private update(mutator: (config: PersistedAppConfig) => PersistedAppConfig): PersistedAppConfig {
    const state = this.loadState();
    const nextConfig = normalizeConfig(mutator(state.config));
    return this.writeConfig(nextConfig, state.extras);
  }

  private loadState(): LoadedConfigState {
    const configPath = this.getConfigPath();

    if (!fs.existsSync(configPath)) {
      return {
        config: createDefaultConfig(),
        extras: {},
        shouldPersist: true,
      };
    }

    try {
      const rawText = fs.readFileSync(configPath, 'utf-8');
      const rawValue = JSON.parse(rawText);
      const rawObject = asRecord(rawValue);
      const config = normalizeConfig(rawObject);
      const extras = extractExtras(rawObject);
      const shouldPersist =
        JSON.stringify(rawObject) !== JSON.stringify(buildPersistedPayload(config, extras));

      return {
        config,
        extras,
        shouldPersist,
      };
    } catch (error) {
      let backupPath: string | null = `${configPath}.corrupt-${Date.now()}`;

      try {
        fs.renameSync(configPath, backupPath);
      } catch {
        backupPath = null;
      }

      this.onConfigRecovery?.({
        configPath,
        backupPath,
        reason: error instanceof Error ? error.message : String(error),
      });

      return {
        config: createDefaultConfig(),
        extras: {},
        shouldPersist: false,
      };
    }
  }

  private writeConfig(config: PersistedAppConfig, extras: Record<string, unknown>): PersistedAppConfig {
    const nextConfig = {
      ...config,
      lastUpdated: new Date().toISOString(),
    };
    const configPath = this.getConfigPath();

    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    fs.writeFileSync(
      configPath,
      JSON.stringify(buildPersistedPayload(nextConfig, extras), null, 2),
      'utf-8'
    );

    return nextConfig;
  }
}

export function createAppConfigStore(options: AppConfigStoreOptions): AppConfigStore {
  return new AppConfigStore(options);
}

function createDefaultConfig(): PersistedAppConfig {
  return {
    meetingDnd: true,
    slackTokens: [],
    sources: normalizeSources({}),
    sourceOrder: [...DEFAULT_SOURCE_ORDER],
    statusConfiguration: normalizeStatusConfiguration({}),
    hasCompletedFirstRun: false,
    logLevel: 'ERROR',
  };
}

function normalizeConfig(value: unknown): PersistedAppConfig {
  const record = asRecord(value);

  return {
    meetingDnd: record.meetingDnd !== false,
    slackTokens: normalizeSlackTokens(record.slackTokens),
    sources: normalizeSources(record.sources),
    sourceOrder: normalizeSourceOrder(record.sourceOrder),
    statusConfiguration: normalizeStatusConfiguration(record.statusConfiguration),
    hasCompletedFirstRun: record.hasCompletedFirstRun === true,
    logLevel: normalizeLogLevel(record.logLevel),
    lastUpdated: typeof record.lastUpdated === 'string' ? record.lastUpdated : undefined,
  };
}

function normalizeSlackTokens(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((token): token is string => typeof token === 'string');
}

function normalizeSources(value: unknown): Record<SourceName, boolean> {
  const record = asRecord(value);

  return DEFAULT_SOURCE_ORDER.reduce((sources, sourceName) => {
    sources[sourceName] = record[sourceName] !== false;
    return sources;
  }, {} as Record<SourceName, boolean>);
}

function normalizeSourceOrder(value: unknown): SourceName[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_SOURCE_ORDER];
  }

  const uniqueValidSources = value.filter(isSourceName).filter((sourceName, index, array) => {
    return array.indexOf(sourceName) === index;
  });

  const missingSources = DEFAULT_SOURCE_ORDER.filter(sourceName => !uniqueValidSources.includes(sourceName));
  return [...uniqueValidSources, ...missingSources];
}

function normalizeStatusConfiguration(value: unknown): StatusConfiguration {
  const record = asRecord(value);
  return {
    customStatuses: normalizeCustomStatuses(record.customStatuses),
    offlineMessages: normalizeOfflineMessages(record.offlineMessages),
    overridablePatterns: normalizeOverridablePatterns(record.overridablePatterns),
  };
}

function normalizeCustomStatuses(value: unknown): CustomStatusConfig[] {
  if (!Array.isArray(value)) {
    return getDefaultStatusConfiguration().filter(status => status.category !== 'offline');
  }

  return (value as CustomStatusConfig[]).filter(status => status.category !== 'offline');
}

function normalizeOfflineMessages(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [...STATUS_MESSAGES.OFFLINE_MESSAGE_LIST];
  }

  return value.filter((message): message is string => typeof message === 'string');
}

function normalizeOverridablePatterns(value: unknown): OverridableStatusPattern[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_OVERRIDABLE_PATTERNS];
  }

  return value as OverridableStatusPattern[];
}

function normalizeLogLevel(value: unknown): LogLevel {
  return VALID_LOG_LEVELS.includes(value as LogLevel) ? (value as LogLevel) : 'ERROR';
}

function buildPersistedPayload(
  config: PersistedAppConfig,
  extras: Record<string, unknown>
): Record<string, unknown> {
  return {
    ...extras,
    meetingDnd: config.meetingDnd,
    slackTokens: [...config.slackTokens],
    sources: { ...config.sources },
    sourceOrder: [...config.sourceOrder],
    statusConfiguration: cloneStatusConfiguration(config.statusConfiguration),
    hasCompletedFirstRun: config.hasCompletedFirstRun,
    logLevel: config.logLevel,
    lastUpdated: config.lastUpdated,
  };
}

function cloneStatusConfiguration(statusConfiguration: StatusConfiguration): StatusConfiguration {
  return {
    customStatuses: [...statusConfiguration.customStatuses],
    offlineMessages: [...statusConfiguration.offlineMessages],
    overridablePatterns: [...(statusConfiguration.overridablePatterns || [])],
  };
}

function extractExtras(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([key]) => !MANAGED_KEYS.has(key))
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isSourceName(value: unknown): value is SourceName {
  return typeof value === 'string' && DEFAULT_SOURCE_ORDER.includes(value as SourceName);
}
