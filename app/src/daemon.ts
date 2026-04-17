import { SlackService } from './services/slack';
import { SlackStatusExecutor } from './services/slackStatusExecutor';
import { StatusManager } from './services/statusManager';
import { POLL_INTERVALS, CustomStatusConfig, getDefaultStatusConfiguration, DEFAULT_OVERRIDABLE_PATTERNS } from './config/statusConfig';
import { DEFAULT_SOURCE_ORDER, MEETING_SOURCE_NAMES, SourceName } from './config/sourceCatalog';
import { SourceArbitrationEngine, TrackedSourceChange } from './services/sources/sourceArbitrationEngine';
import { SourceRegistry } from './services/sources/sourceRegistry';
import { logger } from './utils/logger';
import fs from 'fs';
import path from 'path';

export interface DaemonConfig {
  slackTokens: string | string[];
  configDir?: string;
  onStatusChanged?: (statusData: any) => void; // Callback for status changes
}

export class SlackStatusBotDaemon {
  private slackService: SlackService;
  private slackExecutor: SlackStatusExecutor;
  private statusManager: StatusManager;
  private sourceRegistry: SourceRegistry;
  private sourceArbitrationEngine: SourceArbitrationEngine;
  private running: boolean = false;
  private intervals: NodeJS.Timeout[] = [];
  private configDir: string;
  private sourceOrder: SourceName[] = [...DEFAULT_SOURCE_ORDER];
  private lastResetBlockedTime: number = 0; // Track when reset was last blocked
  private readonly RESET_BLOCKED_COOLDOWN = 30000; // Don't retry reset for 30 seconds if blocked
  private onStatusChanged?: (statusData: any) => void; // Callback for status changes (IPC)
  private lastProfileSetTime: number = 0; // Track when we last set a profile
  private readonly PROFILE_SET_COOLDOWN = 2000; // Minimum 2 seconds between profile updates to avoid rate limiting
  private isPolling: boolean = false; // Prevent concurrent polling cycles
  private pollTimeoutId: NodeJS.Timeout | null = null; // Track polling timeout for cleanup

  constructor(config: DaemonConfig) {
    this.slackService = new SlackService(config.slackTokens);
    this.slackExecutor = new SlackStatusExecutor(this.slackService);
    this.statusManager = new StatusManager(this.slackService);
    this.sourceRegistry = new SourceRegistry();
    this.sourceArbitrationEngine = new SourceArbitrationEngine();
    this.onStatusChanged = config.onStatusChanged;

    this.configDir = config.configDir || this.getDefaultConfigDir();
    this.ensureConfigDir();
    this.loadConfig();
    
    // Listen for status changes from StatusManager and forward them via IPC callback
    this.statusManager.on('statusChanged', (statusData) => {
      logger.info(`[daemon] Status changed event`, statusData);
      if (this.onStatusChanged) {
        this.onStatusChanged(statusData);
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

  /**
   * Manually set status
   */
  async setStatus(emoji: string, message: string): Promise<boolean> {
    return this.statusManager.setCustomStatus(emoji, message);
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
      const winningSource = this.sourceArbitrationEngine.pickWinner(this.sourceOrder, sourceStatuses);

      if (winningSource?.status.message) {
        console.log(`[Daemon] Re-evaluating status with new priority: switching to ${winningSource.sourceName}`);
        this.statusManager.markObservedSourceActive(winningSource.sourceName);

        const statusChanged = await this.statusManager.shouldApplyObservedStatus(
          winningSource.status.emoji!,
          winningSource.status.message
        );

        if (statusChanged) {
          await this.tryApplyObservedStatus(
            winningSource.sourceName,
            winningSource.status.emoji!,
            winningSource.status.message,
            'won after reprioritization'
          );
        }
      } else {
        // No active source, reset
        console.log(`[Daemon] No active source with new priority, resetting status`);
        await this.tryResetWithoutWinner('reprioritization');
      }
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

        let statusWasSet = false;

        for (const change of changes) {
          const { sourceName, status, previous } = change;
          if (change.type === 'activated' || change.type === 'deactivated') {
            logger.debug(`[polling] ${sourceName} state changed: ${previous.wasActive} → ${change.status.isActive}`, {
              lastMessage: previous.lastMessage,
              newMessage: status.message,
            });
          } else if (change.type === 'message-changed') {
            logger.debug(`[polling] ${sourceName} message changed while active`, {
              lastMessage: previous.lastMessage,
              newMessage: status.message,
            });
          }

          // Handle source becoming active OR message changed while active
          if (
            winningSource?.sourceName === sourceName &&
            (change.type === 'activated' || change.type === 'message-changed') &&
            !statusWasSet
          ) {
            statusWasSet = await this.applyWinningSourceChange(change, statusWasSet);
          }
          // Handle source becoming inactive
          else if (change.type === 'deactivated') {
            await this.handleDeactivatedSource(sourceName, sourceStatuses);
          }
        }

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

  private async applyWinningSourceChange(
    change: TrackedSourceChange,
    statusWasSet: boolean
  ): Promise<boolean> {
    const { sourceName, status, type } = change;

    this.statusManager.markObservedSourceActive(sourceName);
    logger.debug(`[polling] Marked source as active in statusCheckState`, { activeSource: sourceName });

    if (type === 'activated' || type === 'message-changed') {
      const statusChanged = await this.statusManager.shouldApplyObservedStatus(status.emoji!, status.message!);
      if (statusChanged) {
        const applied = await this.tryApplyObservedStatus(
          sourceName,
          status.emoji!,
          status.message!,
          type === 'activated' ? 'became active' : 'message changed'
        );
        if (applied) {
          this.sourceArbitrationEngine.recordHandledStatus(sourceName, status.message || '');
          this.statusManager.emitObservedStatusChange(
            status.emoji!,
            status.message!,
            'activeSource'
          );
          statusWasSet = true;
        }
      } else {
        this.sourceArbitrationEngine.recordHandledStatus(sourceName, status.message || '');
        logger.debug(`[polling] ${sourceName} status unchanged or blocked, skipping API call`);
      }
    }

    if (MEETING_SOURCE_NAMES.includes(sourceName) && type === 'activated') {
      logger.info(`[polling] ${sourceName} meeting started, ensuring DND is enabled...`);
      await this.slackExecutor.setMeetingDnd(true);
    }

    return statusWasSet;
  }

  private async handleDeactivatedSource(
    sourceName: SourceName,
    sourceStatuses: Awaited<ReturnType<SlackStatusBotDaemon['getSourceStatuses']>>
  ): Promise<void> {
    console.log(`[polling] ${sourceName} became inactive`);

    this.statusManager.clearObservedSourceActive(sourceName);
    logger.debug(`[polling] Cleared activeSource from statusCheckState`, { wasActive: sourceName });

    await this.syncMeetingDndAfterDeactivation(sourceName, sourceStatuses);

    const nextWinner = this.sourceArbitrationEngine.pickWinner(this.sourceOrder, sourceStatuses, {
      excludeSource: sourceName,
    });

    if (nextWinner && nextWinner.sourceName !== sourceName) {
      console.log(`[polling] Switching status from ${sourceName} to ${nextWinner.sourceName}`);
      this.statusManager.markObservedSourceActive(nextWinner.sourceName);

      const statusChanged = await this.statusManager.shouldApplyObservedStatus(
        nextWinner.status.emoji!,
        nextWinner.status.message!
      );
      if (statusChanged) {
        const applied = await this.tryApplyObservedStatus(
          nextWinner.sourceName,
          nextWinner.status.emoji!,
          nextWinner.status.message!,
          `switching from ${sourceName}`
        );
        if (applied) {
          this.sourceArbitrationEngine.recordHandledStatus(nextWinner.sourceName, nextWinner.status.message || '');
        }
      }
      return;
    }

    await this.tryResetAfterSourceDeactivation(sourceName);
  }

  private async syncMeetingDndAfterDeactivation(
    sourceName: SourceName,
    sourceStatuses: Awaited<ReturnType<SlackStatusBotDaemon['getSourceStatuses']>>
  ): Promise<void> {
    if (!MEETING_SOURCE_NAMES.includes(sourceName)) {
      return;
    }

    const activeMeetings = this.sourceArbitrationEngine.listActiveSources(MEETING_SOURCE_NAMES, sourceStatuses, {
      excludeSource: sourceName,
    });

    if (activeMeetings.length > 0) {
      logger.info(
        `[polling] ${sourceName} meeting ended, but another meeting is active (${activeMeetings.join(', ')}), keeping DND enabled`
      );
      return;
    }

    logger.info(`[polling] ${sourceName} meeting ended and no other meetings active, disabling DND...`);
    await this.slackExecutor.setMeetingDnd(false);
  }

  private async tryApplyObservedStatus(
    sourceName: SourceName,
    emoji: string,
    message: string,
    reason: string
  ): Promise<boolean> {
    const now = Date.now();
    const timeSinceLastSet = now - this.lastProfileSetTime;

    if (timeSinceLastSet < this.PROFILE_SET_COOLDOWN) {
      const remainingCooldown = Math.ceil((this.PROFILE_SET_COOLDOWN - timeSinceLastSet) / 1000);
      logger.debug(`[polling] ${sourceName} status changed but rate limited (${remainingCooldown}s cooldown remaining)`, {
        emoji,
        message,
      });
      return false;
    }

    logger.info(`[polling] ${sourceName} ${reason}, setting status`, { emoji, message });
    await this.slackExecutor.setSourceStatus(emoji, message);
    this.lastProfileSetTime = now;
    return true;
  }

  private async tryResetAfterSourceDeactivation(sourceName: SourceName): Promise<void> {
    const now = Date.now();
    const timeSinceLastBlock = now - this.lastResetBlockedTime;

    const currentStatus = await this.slackExecutor.getProfile();
    if (currentStatus) {
      this.statusManager.emitObservedStatusChange(
        currentStatus.status_emoji,
        currentStatus.status_text,
        'sourceInactive'
      );
    }

    if (timeSinceLastBlock < this.RESET_BLOCKED_COOLDOWN) {
      const remainingCooldown = Math.ceil((this.RESET_BLOCKED_COOLDOWN - timeSinceLastBlock) / 1000);
      logger.debug(`[polling] Reset is blocked, cooldown active (${remainingCooldown}s remaining)`);
      return;
    }

    logger.info(`[polling] ${sourceName} became inactive, no other source active - attempting reset`);
    const resetSuccess = await this.statusManager.reset();
    if (resetSuccess) {
      logger.info(`[polling] Status reset successful after ${sourceName} deactivation`);
      this.lastResetBlockedTime = 0;
      return;
    }

    logger.warn(`[polling] Status reset failed after ${sourceName} deactivation (likely blocked by isStatusClean)`);
    this.lastResetBlockedTime = now;
  }

  private async tryResetWithoutWinner(reason: string): Promise<void> {
    const now = Date.now();
    const timeSinceLastBlock = now - this.lastResetBlockedTime;

    if (timeSinceLastBlock < this.RESET_BLOCKED_COOLDOWN) {
      const remainingCooldown = Math.ceil((this.RESET_BLOCKED_COOLDOWN - timeSinceLastBlock) / 1000);
      logger.debug(`[polling] Reset is blocked, cooldown active (${remainingCooldown}s remaining)`, { reason });
      return;
    }

    const resetSuccess = await this.statusManager.reset();
    if (resetSuccess) {
      logger.info(`[polling] Status reset successful`, { reason });
      this.lastResetBlockedTime = 0;
      return;
    }

    logger.warn(`[polling] Status reset failed`, { reason });
    this.lastResetBlockedTime = now;
  }

  private startStatusCorrection(): void {
    // Correct status every 60 seconds
    const interval = setInterval(async () => {
      try {
        await this.statusManager.runCorrectionCycle();
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

  private ensureConfigDir(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }

  private getConfigFilePath(): string {
    return path.join(this.configDir, 'config.json');
  }

  private loadConfig(): void {
    const configFile = this.getConfigFilePath();
    let isNewConfig = false; // Track if we're creating a new config
    
    if (fs.existsSync(configFile)) {
      try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        
        if (config.sources) {
          this.sourceRegistry.applyEnabledConfig(config.sources);
        }

        // Load source order
        if (config.sourceOrder && Array.isArray(config.sourceOrder)) {
          this.sourceOrder = config.sourceOrder;
        }

        // Load status configuration from config file
        if (config.statusConfiguration && Array.isArray(config.statusConfiguration.customStatuses)) {
          // Load exactly what's in the config file, without merging with defaults
          // If user deleted default statuses, they should stay deleted
          this.statusManager.setCustomStatuses(config.statusConfiguration.customStatuses);
        } else {
          // Initialize with defaults only if config doesn't exist
          this.statusManager.setCustomStatuses(getDefaultStatusConfiguration());
          isNewConfig = true;
        }

        // Load overridable patterns from config file
        if (config.statusConfiguration && Array.isArray(config.statusConfiguration.overridablePatterns)) {
          this.statusManager.setOverridablePatterns(config.statusConfiguration.overridablePatterns);
        } else {
          // Initialize with defaults if not in config
          this.statusManager.setOverridablePatterns(DEFAULT_OVERRIDABLE_PATTERNS);
          isNewConfig = true;
        }
      } catch (error) {
        console.error('Error loading config:', error);
        // Initialize with defaults on error
        this.statusManager.setCustomStatuses(getDefaultStatusConfiguration());
        this.statusManager.setOverridablePatterns(DEFAULT_OVERRIDABLE_PATTERNS);
        isNewConfig = true;
      }

      // Save config if we loaded defaults to persist them
      if (isNewConfig) {
        this.saveConfig();
      }
    } else {
      // Initialize with defaults if config file doesn't exist
      this.statusManager.setCustomStatuses(getDefaultStatusConfiguration());
      this.statusManager.setOverridablePatterns(DEFAULT_OVERRIDABLE_PATTERNS);
      
      // Save default config on first run
      this.saveConfig();
    }
  }

  private saveConfig(): void {
    const configFile = this.getConfigFilePath();
    
    // Read existing config to preserve slackTokens
    let existingConfig: any = {};
    try {
      if (fs.existsSync(configFile)) {
        existingConfig = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      }
    } catch (error) {
      console.error('Error reading existing config:', error);
    }

    const config = {
      ...existingConfig, // Keep existing fields like slackTokens
      sources: {
        ...this.sourceRegistry.getEnabledConfig(),
      },
      sourceOrder: this.sourceOrder,
      statusConfiguration: {
        customStatuses: this.statusManager.getCustomStatuses(),
        overridablePatterns: this.statusManager.getOverridablePatterns(),
      },
      lastUpdated: new Date().toISOString(),
    };

    try {
      fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error saving config:', error);
    }
  }

  /**
   * Set the log level for the daemon's logger
   */
  setLogLevel(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'): void {
    logger.setLogLevel(level);
  }

  /**
   * Get the current log level
   */
  getLogLevel(): string {
    return logger.getLogLevel();
  }
}

// Export singleton instance
let daemonInstance: SlackStatusBotDaemon | null = null;

export function getDaemon(config?: DaemonConfig): SlackStatusBotDaemon {
  if (!daemonInstance && config) {
    daemonInstance = new SlackStatusBotDaemon(config);
  }
  if (!daemonInstance) {
    throw new Error('Daemon not initialized. Please provide config.');
  }
  return daemonInstance;
}

export function createDaemon(config: DaemonConfig): SlackStatusBotDaemon {
  daemonInstance = new SlackStatusBotDaemon(config);
  return daemonInstance;
}
