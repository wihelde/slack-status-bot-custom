import { SlackService } from './services/slack';
import { SlackStatusExecutor } from './services/slackStatusExecutor';
import { StatusManager } from './services/statusManager';
import { POLL_INTERVALS, CustomStatusConfig, getDefaultStatusConfiguration, getOfflineStatusConfiguration, DEFAULT_OVERRIDABLE_PATTERNS } from './config/statusConfig';
import { DEFAULT_SOURCE_ORDER, SourceName } from './config/sourceCatalog';
import { AppConfigStore, createAppConfigStore } from './config/appConfigStore';
import { SourceArbitrationEngine } from './services/sources/sourceArbitrationEngine';
import { SourceRegistry } from './services/sources/sourceRegistry';
import { RuntimeOrchestrator } from './services/runtimeOrchestrator';
import type { AppStatusChangedEvent } from './contracts/ipc';
import type { WorkspaceStatusSnapshot } from './contracts/appSnapshot';
import { logger } from './utils/logger';
import path from 'path';

export interface DaemonConfig {
  slackTokens: string | string[];
  configDir?: string;
  configStore?: AppConfigStore;
  onAppStateChanged?: (statusData: AppStatusChangedEvent) => void;
  onWorkspaceDeliveryChanged?: () => void;
  workspaceConnections?: Pick<WorkspaceStatusSnapshot, 'teamId' | 'teamName' | 'userName'>[];
}

export class SlackStatusBotDaemon {
  private slackService: SlackService;
  private workspaceConnections: Pick<WorkspaceStatusSnapshot, 'teamId' | 'teamName' | 'userName'>[];
  private slackExecutor: SlackStatusExecutor;
  private statusManager: StatusManager;
  private sourceRegistry: SourceRegistry;
  private sourceArbitrationEngine: SourceArbitrationEngine;
  private runtimeOrchestrator: RuntimeOrchestrator;
  private running: boolean = false;
  private intervals: NodeJS.Timeout[] = [];
  private configDir: string;
  private sourceOrder: SourceName[] = [...DEFAULT_SOURCE_ORDER];
  private onAppStateChanged?: (statusData: AppStatusChangedEvent) => void;
  private onWorkspaceDeliveryChanged?: () => void;
  private configStore: AppConfigStore;
  private isPolling: boolean = false; // Prevent concurrent polling cycles
  private pollTimeoutId: NodeJS.Timeout | null = null; // Track polling timeout for cleanup

  constructor(config: DaemonConfig) {
    this.slackService = new SlackService(config.slackTokens);
    this.workspaceConnections = config.workspaceConnections || [];
    this.slackExecutor = new SlackStatusExecutor(this.slackService);
    this.statusManager = new StatusManager(this.slackService);
    this.sourceRegistry = new SourceRegistry();
    this.sourceArbitrationEngine = new SourceArbitrationEngine();
    this.runtimeOrchestrator = new RuntimeOrchestrator({
      statusManager: this.statusManager,
      slackExecutor: this.slackExecutor,
      sourceArbitrationEngine: this.sourceArbitrationEngine,
    });
    this.onAppStateChanged = config.onAppStateChanged;
    this.onWorkspaceDeliveryChanged = config.onWorkspaceDeliveryChanged;

    this.configDir = config.configDir || this.getDefaultConfigDir();
    this.configStore = config.configStore || createAppConfigStore({ configDir: this.configDir });
    this.loadConfig();
    
    // Listen for status changes from StatusManager and forward them via IPC callback
    this.statusManager.on('statusChanged', (statusData) => {
      logger.info(`[daemon] Status changed event`, statusData);
      if (this.onAppStateChanged) {
        this.onAppStateChanged(statusData);
      }
    });
  }

  /**
   * Start the daemon
   */
  async start(): Promise<void> {
    if (this.running) {
      console.log('Daemon is already running');
      return;
    }

    this.running = true;
    console.log('🚀 Starting Slack Status Bot Daemon...');

    await this.statusManager.restoreProtectedStatusFromSlack();

    // Start polling loops
    this.startSourcePolling();
    this.startStatusCorrection();

    console.log('✅ Daemon started successfully');
  }

  /**
   * Stop the daemon
   */
  async stop(): Promise<void> {
    if (!this.running) {
      console.log('Daemon is not running');
      return;
    }

    this.running = false;
    console.log('Stopping daemon...');

    // Clear all intervals
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
    
    // Clear polling timeout
    if (this.pollTimeoutId) {
      clearTimeout(this.pollTimeoutId);
      this.pollTimeoutId = null;
    }

    this.saveConfig();
    console.log('✅ Daemon stopped');
  }

  /**
   * Check if daemon is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get current source statuses
   */
  async getSourceStatuses() {
    return this.sourceRegistry.getStatuses();
  }

  /**
   * Get current Slack status
   */
  async getSlackStatus() {
    const profile = await this.slackExecutor.getProfile();
    return {
      emoji: profile?.status_emoji || '',
      text: profile?.status_text || '',
      stateCheckValue: this.statusManager.getStatusCheckState().value,
    };
  }

  async getWorkspaceStatuses(): Promise<WorkspaceStatusSnapshot[]> {
    const observations = await this.slackService.observeWorkspaces();
    return observations.map((observation, index) => ({
      teamId: this.workspaceConnections[index]?.teamId || null,
      teamName: this.workspaceConnections[index]?.teamName || null,
      userName: this.workspaceConnections[index]?.userName || null,
      ...observation,
    }));
  }

  async runCorrectionCycle(): Promise<void> {
    if (this.slackService.hasExpiredProfileIntent()) {
      const observed = await this.slackExecutor.getProfile();
      this.slackService.refreshReferenceProfile(
        observed && this.statusManager.isTrustedSharedProfile(observed) ? observed : null);
    }
    if (await this.slackService.synchronizeMissed()) this.onWorkspaceDeliveryChanged?.();
    await this.statusManager.runCorrectionCycle();
  }

  async updateConnections(tokens: string[], connections: DaemonConfig['workspaceConnections'] = []): Promise<void> {
    const observed = await this.slackExecutor.getProfile();
    const reference = observed && this.statusManager.isTrustedSharedProfile(observed) ? observed : null;
    if (observed && !reference && !this.slackService.matchesIntendedProfile(observed)) {
      this.slackService.forgetIntendedStatus();
    }
    this.slackService.reconfigure(tokens, this.workspaceConnections.map(connection => connection.teamId),
      connections.map(connection => connection.teamId), reference);
    this.workspaceConnections = connections;
    await this.slackService.synchronizeMissed();
  }

  /**
   * Manually set status
   */
  async setStatus(emoji: string, message: string): Promise<boolean> {
    return this.statusManager.setCustomStatus(emoji, message);
  }

  async setExternalStatus(emoji: string, message: string, presence: 'auto' | 'away' = 'auto'): Promise<boolean> {
    return this.statusManager.setExternalStatus(emoji, message, presence);
  }

  /**
   * Go online
   */
  async goOnline(): Promise<boolean> {
    return this.statusManager.goOnline();
  }

  /**
   * Go away
   */
  async goAway(): Promise<boolean> {
    return this.statusManager.goAway();
  }

  /**
   * Set holiday status with return date
   */
  async setHoliday(returnDate: string): Promise<boolean> {
    return this.statusManager.setHoliday(returnDate);
  }

  /**
   * Get current status configuration
   */
  getStatusConfiguration(): CustomStatusConfig[] {
    return this.statusManager.getCustomStatuses();
  }

  /**
   * Update status configuration and persist to file
   */
  async updateStatusConfiguration(config: CustomStatusConfig[]): Promise<boolean> {
    try {
      this.statusManager.setCustomStatuses(config);
      this.saveConfig();
      
      logger.info('[daemon] Status configuration updated', { count: config.length });
      return true;
    } catch (error) {
      logger.error('[daemon] Failed to update status configuration', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Reset status configuration to defaults
   */
  async resetStatusConfiguration(): Promise<boolean> {
    try {
      this.statusManager.setCustomStatuses(getDefaultStatusConfiguration());
      this.saveConfig();
      
      logger.info('[daemon] Status configuration reset to defaults');
      return true;
    } catch (error) {
      logger.error('[daemon] Failed to reset status configuration', { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Toggle source enable/disable
   */
  toggleSource(source: SourceName, enabled: boolean): void {
    this.sourceRegistry.setEnabled(source, enabled);
    this.saveConfig();
  }

  /**
   * Get current source priority order
   */
  getSourceOrder(): SourceName[] {
    return [...this.sourceOrder];
  }

  /**
   * Update source priority order at runtime
   */
  async setSourceOrder(newOrder: SourceName[]): Promise<void> {
    this.sourceOrder = [...newOrder];
    this.saveConfig();
    console.log('[Daemon] Source order updated at runtime:', this.sourceOrder);
    
    // Re-evaluate current status based on new priority order
    try {
      const sourceStatuses = await this.getSourceStatuses();
      await this.runtimeOrchestrator.handleReprioritization({
        sourceOrder: this.sourceOrder,
        sourceStatuses,
      });
    } catch (error) {
      console.error('[Daemon] Error re-evaluating status after priority change:', error);
    }
  }

  // Private helpers

  private startSourcePolling(): void {
    this.sourceArbitrationEngine.resetTrackingState(this.sourceRegistry.getSourceNames());

    // Poll all sources - use recursive setTimeout instead of setInterval to ensure
    // no concurrent polling cycles (setInterval doesn't wait for async operations to complete)
    const poll = async (): Promise<void> => {
      if (this.isPolling) {
        logger.debug('[polling] Polling already in progress, skipping this cycle');
        return;
      }

      this.isPolling = true;

      try {
        const sourceStatuses = await this.getSourceStatuses();
        const arbitrationSnapshot = this.sourceArbitrationEngine.evaluate(this.sourceOrder, sourceStatuses);
        const { winningSource, activeSources: activeSourcesDebug, changes, trackingState } = arbitrationSnapshot;
        if (activeSourcesDebug.length > 0) {
          logger.debug(`[polling] Active sources: ${activeSourcesDebug.join(', ')}`);
        }
        await this.runtimeOrchestrator.handlePollingSnapshot({
          sourceOrder: this.sourceOrder,
          sourceStatuses,
          snapshot: arbitrationSnapshot,
        });

        const anyActive = !!winningSource;
        const anyWasActive = Object.values(trackingState).some(s => s.wasActive);
        
        logger.debug(`[polling] Polling cycle end`, {
          anyActive,
          anyWasActive,
          currentState: Object.entries(trackingState).reduce(
            (acc, [name, state]) => ({ ...acc, [name]: state.wasActive }),
            {}
          ),
        });
        
        if (!anyActive && anyWasActive) {
          // This is handled above when each source transitions to inactive
        }
      } catch (error) {
        console.error('Error polling sources:', error);
      } finally {
        this.isPolling = false;
      }

      // Schedule next poll only after this one completes
      // This prevents concurrent polling cycles
      if (this.running) {
        this.pollTimeoutId = setTimeout(poll, POLL_INTERVALS.SPOTIFY);
      }
    };

    // Start first poll
    poll();
  }

  private startStatusCorrection(): void {
    // Correct status every 60 seconds
    const interval = setInterval(async () => {
      try {
        await this.runCorrectionCycle();
      } catch (error) {
        console.error('Error correcting status:', error);
      }
    }, POLL_INTERVALS.STATUS_CORRECTION);

    this.intervals.push(interval);
  }

  private getDefaultConfigDir(): string {
    if (process.platform === 'darwin') {
      return path.join(process.env.HOME || '~', 'Library', 'Application Support', 'slack-status-bot');
    } else if (process.platform === 'win32') {
      return path.join(process.env.APPDATA || 'C:\\Users\\Default\\AppData\\Roaming', 'slack-status-bot');
    } else {
      return path.join(process.env.HOME || '~', '.config', 'slack-status-bot');
    }
  }

  private loadConfig(): void {
    const config = this.configStore.getDaemonSettings();

    this.sourceRegistry.applyEnabledConfig(config.sources);
    this.sourceOrder = [...config.sourceOrder];
    this.statusManager.setCustomStatuses([
      ...config.statusConfiguration.customStatuses,
      ...getOfflineStatusConfiguration(config.statusConfiguration.offlineMessages),
    ]);
    this.statusManager.setOverridablePatterns(
      config.statusConfiguration.overridablePatterns || DEFAULT_OVERRIDABLE_PATTERNS
    );
  }

  private saveConfig(): void {
    const statuses = this.statusManager.getCustomStatuses();
    this.configStore.updateDaemonSettings({
      sources: this.sourceRegistry.getEnabledConfig(),
      sourceOrder: this.sourceOrder,
      statusConfiguration: {
        customStatuses: statuses.filter(status => status.category !== 'offline'),
        offlineMessages: statuses
          .filter(status => status.category === 'offline')
          .map(status => status.message),
        overridablePatterns: this.statusManager.getOverridablePatterns(),
      },
    });
  }

  /**
   * Set the log level for the daemon's logger
   */
  setLogLevel(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'): void {
    logger.setLogLevel(level);
  }

}

let daemonInstance: SlackStatusBotDaemon | null = null;

export function createDaemon(config: DaemonConfig): SlackStatusBotDaemon {
  daemonInstance = new SlackStatusBotDaemon(config);
  return daemonInstance;
}
