import { SlackService } from './services/slack';
import { StatusManager } from './services/statusManager';
import { SpotifyAdapter } from './services/sources/spotify';
import { AppleMusicAdapter } from './services/sources/appleMusic';
import { ZoomAdapter, TeamsAdapter, HuddleAdapter } from './services/sources/meetings';
import { POLL_INTERVALS } from './config/statusConfig';
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
  private statusManager: StatusManager;
  private spotify: SpotifyAdapter;
  private appleMusic: AppleMusicAdapter;
  private zoom: ZoomAdapter;
  private teams: TeamsAdapter;
  private huddle: HuddleAdapter;
  private running: boolean = false;
  private intervals: NodeJS.Timeout[] = [];
  private configDir: string;
  private sourceOrder: string[] = ['spotify', 'appleMusic', 'zoom', 'teams', 'huddle'];
  private lastResetBlockedTime: number = 0; // Track when reset was last blocked
  private readonly RESET_BLOCKED_COOLDOWN = 30000; // Don't retry reset for 30 seconds if blocked
  private onStatusChanged?: (statusData: any) => void; // Callback for status changes (IPC)

  constructor(config: DaemonConfig) {
    this.slackService = new SlackService(config.slackTokens);
    this.statusManager = new StatusManager(this.slackService);
    this.onStatusChanged = config.onStatusChanged;
    
    this.spotify = new SpotifyAdapter();
    this.appleMusic = new AppleMusicAdapter();
    this.zoom = new ZoomAdapter();
    this.teams = new TeamsAdapter();
    this.huddle = new HuddleAdapter();

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
    return {
      spotify: {
        ...await this.spotify.getStatus(),
        enabled: this.spotify.isEnabled(),
      },
      appleMusic: {
        ...await this.appleMusic.getStatus(),
        enabled: this.appleMusic.isEnabled(),
      },
      zoom: {
        ...await this.zoom.getStatus(),
        enabled: this.zoom.isEnabled(),
      },
      teams: {
        ...await this.teams.getStatus(),
        enabled: this.teams.isEnabled(),
      },
      huddle: {
        ...await this.huddle.getStatus(),
        enabled: this.huddle.isEnabled(),
      },
    };
  }

  /**
   * Get current Slack status
   */
  async getSlackStatus() {
    const profile = await this.slackService.getProfile();
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
   * Toggle source enable/disable
   */
  toggleSource(source: 'spotify' | 'appleMusic' | 'zoom' | 'teams' | 'huddle', enabled: boolean): void {
    switch (source) {
      case 'spotify':
        this.spotify.setEnabled(enabled);
        break;
      case 'appleMusic':
        this.appleMusic.setEnabled(enabled);
        break;
      case 'zoom':
        this.zoom.setEnabled(enabled);
        break;
      case 'teams':
        this.teams.setEnabled(enabled);
        break;
      case 'huddle':
        this.huddle.setEnabled(enabled);
        break;
    }
    this.saveConfig();
  }

  /**
   * Get current source priority order
   */
  getSourceOrder(): string[] {
    return this.sourceOrder;
  }

  /**
   * Update source priority order at runtime
   */
  async setSourceOrder(newOrder: string[]): Promise<void> {
    this.sourceOrder = newOrder;
    console.log('[Daemon] Source order updated at runtime:', this.sourceOrder);
    
    // Re-evaluate current status based on new priority order
    try {
      const sourceStatuses = await this.getSourceStatuses();
      const activeStatuses: Record<string, boolean> = {
        spotify: sourceStatuses?.spotify?.isActive && this.spotify.isEnabled(),
        appleMusic: sourceStatuses?.appleMusic?.isActive && this.appleMusic.isEnabled(),
        zoom: sourceStatuses?.zoom?.isActive && this.zoom.isEnabled(),
        teams: sourceStatuses?.teams?.isActive && this.teams.isEnabled(),
        huddle: sourceStatuses?.huddle?.isActive && this.huddle.isEnabled(),
      };

      // Find the first active source in new priority order
      const highestPrioritySource = this.sourceOrder.find(s => activeStatuses[s]);

      if (highestPrioritySource) {
        const status = sourceStatuses[highestPrioritySource as keyof typeof sourceStatuses];
        if (status && status.message) {
          console.log(`[Daemon] Re-evaluating status with new priority: switching to ${highestPrioritySource}`);
          const canChange = await this.statusManager.isStatusClean();
          if (canChange) {
            await this.slackService.setProfile(status.emoji!, status.message!);
          }
        }
      } else {
        // No active source, reset
        console.log(`[Daemon] No active source with new priority, resetting status`);
        await this.statusManager.reset();
      }
    } catch (error) {
      console.error('[Daemon] Error re-evaluating status after priority change:', error);
    }
  }

  // Private helpers

  private startSourcePolling(): void {
    // Track state for each source
    const sourceState: Record<string, { wasActive: boolean; lastMessage: string }> = {
      spotify: { wasActive: false, lastMessage: '' },
      appleMusic: { wasActive: false, lastMessage: '' },
      zoom: { wasActive: false, lastMessage: '' },
      teams: { wasActive: false, lastMessage: '' },
      huddle: { wasActive: false, lastMessage: '' },
    };

    // Poll all sources every second
    const interval = setInterval(async () => {
      try {
        const sourceStatuses = await this.getSourceStatuses();

        // Get current active status for each source
        const activeStatuses: Record<string, boolean> = {
          spotify: sourceStatuses.spotify.isActive && this.spotify.isEnabled(),
          appleMusic: sourceStatuses.appleMusic.isActive && this.appleMusic.isEnabled(),
          zoom: sourceStatuses.zoom.isActive && this.zoom.isEnabled(),
          teams: sourceStatuses.teams.isActive && this.teams.isEnabled(),
          huddle: sourceStatuses.huddle.isActive && this.huddle.isEnabled(),
        };

        // Debug: Log active statuses
        const activeSourcesDebug = Object.entries(activeStatuses)
          .filter(([_, isActive]) => isActive)
          .map(([name]) => name);
        if (activeSourcesDebug.length > 0) {
          logger.debug(`[polling] Active sources: ${activeSourcesDebug.join(', ')}`);
        }

        // Track which status was set (last active source in priority order wins)
        let statusWasSet = false;
        let currentActiveSource: string | null = null;

        // Process sources in priority order (sourceOrder defines the priority)
        for (const sourceName of this.sourceOrder) {
          const isActive = activeStatuses[sourceName];
          const wasActive = sourceState[sourceName].wasActive;
          const status = sourceStatuses[sourceName as keyof typeof sourceStatuses];

          if (!status) continue;

          // Check if this is a state transition (active <-> inactive)
          const isStateTransition = isActive !== wasActive;
          
          // Check if message changed while source is still active (e.g., song changed)
          const messageChanged = isActive && wasActive && status.message && status.message !== sourceState[sourceName].lastMessage;

          // Skip if no state change AND no message change
          if (!isStateTransition && !messageChanged) {
            continue;
          }

          // Debug: Log state transitions or message changes
          if (isStateTransition) {
            logger.debug(`[polling] ${sourceName} state changed: ${wasActive} → ${isActive}`, {
              lastMessage: sourceState[sourceName].lastMessage,
              newMessage: status.message,
            });
          } else if (messageChanged) {
            logger.debug(`[polling] ${sourceName} message changed while active`, {
              lastMessage: sourceState[sourceName].lastMessage,
              newMessage: status.message,
            });
          }

          // Update state IMMEDIATELY to prevent race conditions
          sourceState[sourceName].wasActive = isActive;

          // Handle source becoming active OR message changed while active
          if (isActive && !statusWasSet) {
            currentActiveSource = sourceName;
            
            // Update statusCheckState to track active source
            // This prevents correctStatus() from trying to reset to day-based status while a source is active
            const currentState = this.statusManager.getStatusCheckState();
            this.statusManager.setStatusCheckState({ ...currentState, activeSource: sourceName });
            logger.debug(`[polling] Marked source as active in statusCheckState`, { activeSource: sourceName });
            
            // Only set status if message changed (covers both new activation and song changes)
            if (status.message !== sourceState[sourceName].lastMessage) {
              const canChange = await this.statusManager.isStatusClean();
              if (canChange) {
                sourceState[sourceName].lastMessage = status.message || '';
                const logReason = isStateTransition ? 'became active' : 'message changed';
                logger.info(`[polling] ${sourceName} ${logReason}, setting status`, { emoji: status.emoji, message: status.message });
                await this.slackService.setProfile(status.emoji!, status.message!);
                
                // Emit status changed event for UI update
                this.statusManager.emit('statusChanged', { 
                  emoji: status.emoji, 
                  message: status.message,
                  stateValue: 'activeSource'
                });
                statusWasSet = true;
              } else {
                logger.warn(`[polling] ${sourceName} became active but status is not clean, skipping status change`);
              }
            }

            // Handle DND for meetings - ALWAYS enable when a meeting starts
            // DND is independent of status text and should work even with custom statuses
            if ((sourceName === 'zoom' || sourceName === 'teams' || sourceName === 'huddle') && !wasActive) {
              logger.info(`[polling] ${sourceName} meeting started, ensuring DND is enabled...`);
              await this.slackService.enableDND();
            }
          }
          // Handle source becoming inactive
          else if (!isActive && wasActive) {
            sourceState[sourceName].lastMessage = '';
            console.log(`[polling] ${sourceName} became inactive`);

            // Clear activeSource from statusCheckState
            const currentState = this.statusManager.getStatusCheckState();
            if (currentState.activeSource === sourceName) {
              this.statusManager.setStatusCheckState({ ...currentState, activeSource: undefined });
              logger.debug(`[polling] Cleared activeSource from statusCheckState`, { wasActive: sourceName });
            }

            // Handle DND for meetings - only disable if NO other meeting is active
            if (sourceName === 'zoom' || sourceName === 'teams' || sourceName === 'huddle') {
              // Check if ANY other meeting source is still active
              const otherMeetingActive = 
                (sourceName !== 'zoom' && activeStatuses['zoom']) ||
                (sourceName !== 'teams' && activeStatuses['teams']) ||
                (sourceName !== 'huddle' && activeStatuses['huddle']);
              
              if (otherMeetingActive) {
                const activeMeetings = ['zoom', 'teams', 'huddle']
                  .filter(s => s !== sourceName && activeStatuses[s])
                  .join(', ');
                logger.info(`[polling] ${sourceName} meeting ended, but another meeting is active (${activeMeetings}), keeping DND enabled`);
              } else {
                logger.info(`[polling] ${sourceName} meeting ended and no other meetings active, disabling DND...`);
                await this.slackService.disableDND();
              }
            }

            // Check if another source is still active
            const nextActiveSource = this.sourceOrder.find(
              s => activeStatuses[s] && s !== sourceName
            );

            if (nextActiveSource && nextActiveSource !== sourceName) {
              // Switch to next active source in priority order
              const nextStatus = sourceStatuses[nextActiveSource as keyof typeof sourceStatuses];
              if (nextStatus && nextStatus.message) {
                console.log(`[polling] Switching status from ${sourceName} to ${nextActiveSource}`);
                const canChange = await this.statusManager.isStatusClean();
                if (canChange) {
                  sourceState[nextActiveSource].lastMessage = nextStatus.message;
                  await this.slackService.setProfile(nextStatus.emoji!, nextStatus.message!);
                }
              }
            } else {
              // No other source is active, reset status
              const now = Date.now();
              const timeSinceLastBlock = now - this.lastResetBlockedTime;
              
              // Emit status changed event to update UI about source deactivation
              const currentStatus = await this.slackService.getProfile();
              if (currentStatus) {
                this.statusManager.emit('statusChanged', {
                  emoji: currentStatus.status_emoji,
                  message: currentStatus.status_text,
                  stateValue: 'sourceInactive'
                });
              }
              
              // Only attempt reset if enough time has passed since last block
              if (timeSinceLastBlock >= this.RESET_BLOCKED_COOLDOWN) {
                logger.info(`[polling] ${sourceName} became inactive, no other source active - attempting reset`);
                const resetSuccess = await this.statusManager.reset();
                if (resetSuccess) {
                  logger.info(`[polling] Status reset successful after ${sourceName} deactivation`);
                  this.lastResetBlockedTime = 0; // Reset cooldown on success
                } else {
                  logger.warn(`[polling] Status reset failed after ${sourceName} deactivation (likely blocked by isStatusClean)`);
                  this.lastResetBlockedTime = now; // Start cooldown
                }
              } else {
                const remainingCooldown = Math.ceil((this.RESET_BLOCKED_COOLDOWN - timeSinceLastBlock) / 1000);
                logger.debug(`[polling] Reset is blocked, cooldown active (${remainingCooldown}s remaining)`);
              }
            }
          }
        }

        // If no source is active but one was before, reset status
        const anyActive = Object.values(activeStatuses).some(v => v);
        const anyWasActive = Object.values(sourceState).some(s => s.wasActive);
        
        logger.debug(`[polling] Polling cycle end`, {
          anyActive,
          anyWasActive,
          currentState: Object.entries(sourceState).reduce(
            (acc, [name, state]) => ({ ...acc, [name]: state.wasActive }),
            {}
          ),
        });
        
        if (!anyActive && anyWasActive) {
          // This is handled above when each source transitions to inactive
        }
      } catch (error) {
        console.error('Error polling sources:', error);
      }
    }, POLL_INTERVALS.SPOTIFY);

    this.intervals.push(interval);
  }

  private startStatusCorrection(): void {
    // Correct status every 60 seconds
    const interval = setInterval(async () => {
      try {
        await this.statusManager.correctStatus();
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
    if (fs.existsSync(configFile)) {
      try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        
        // Restore source enabled states
        if (config.sources) {
          this.spotify.setEnabled(config.sources.spotify !== false);
          this.appleMusic.setEnabled(config.sources.appleMusic !== false);
          this.zoom.setEnabled(config.sources.zoom !== false);
          this.teams.setEnabled(config.sources.teams !== false);
          this.huddle.setEnabled(config.sources.huddle !== false);
        }

        // Load source order
        if (config.sourceOrder && Array.isArray(config.sourceOrder)) {
          this.sourceOrder = config.sourceOrder;
        }
      } catch (error) {
        console.error('Error loading config:', error);
      }
    }
  }

  private saveConfig(): void {
    const configFile = this.getConfigFilePath();
    
    // Read existing config to preserve slackTokens and sourceOrder
    let existingConfig: any = {};
    try {
      if (fs.existsSync(configFile)) {
        existingConfig = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
      }
    } catch (error) {
      console.error('Error reading existing config:', error);
    }

    const config = {
      ...existingConfig, // Keep existing fields like slackTokens and sourceOrder
      sources: {
        spotify: this.spotify.isEnabled(),
        appleMusic: this.appleMusic.isEnabled(),
        zoom: this.zoom.isEnabled(),
        teams: this.teams.isEnabled(),
        huddle: this.huddle.isEnabled(),
      },
      sourceOrder: existingConfig.sourceOrder || ['spotify', 'appleMusic', 'zoom', 'teams', 'huddle'],
      lastUpdated: new Date().toISOString(),
    };

    try {
      fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
    } catch (error) {
      console.error('Error saving config:', error);
    }
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
