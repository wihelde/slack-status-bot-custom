import { SlackService } from './services/slack';
import { StatusManager } from './services/statusManager';
import { SpotifyAdapter } from './services/sources/spotify';
import { AppleMusicAdapter } from './services/sources/appleMusic';
import { ZoomAdapter, TeamsAdapter, HuddleAdapter } from './services/sources/meetings';
import { POLL_INTERVALS } from './config/statusConfig';
import fs from 'fs';
import path from 'path';

export interface DaemonConfig {
  slackTokens: string | string[];
  configDir?: string;
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

  constructor(config: DaemonConfig) {
    this.slackService = new SlackService(config.slackTokens);
    this.statusManager = new StatusManager(this.slackService);
    
    this.spotify = new SpotifyAdapter();
    this.appleMusic = new AppleMusicAdapter();
    this.zoom = new ZoomAdapter();
    this.teams = new TeamsAdapter();
    this.huddle = new HuddleAdapter();

    this.configDir = config.configDir || this.getDefaultConfigDir();
    this.ensureConfigDir();
    this.loadConfig();
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
      spotify: await this.spotify.getStatus(),
      appleMusic: await this.appleMusic.getStatus(),
      zoom: await this.zoom.getStatus(),
      teams: await this.teams.getStatus(),
      huddle: await this.huddle.getStatus(),
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

  // Private helpers

  private startSourcePolling(): void {
    let wasSpotifyActive = false;
    let wasAppleMusicActive = false;
    let wasZoomActive = false;
    let wasTeamsActive = false;
    let wasHuddleActive = false;
    
    // Track last message for each source to avoid API calls when message hasn't changed
    let lastSpotifyMessage = '';
    let lastAppleMusicMessage = '';
    let lastZoomMessage = '';
    let lastTeamsMessage = '';
    let lastHuddleMessage = '';

    // Poll all sources every second
    const interval = setInterval(async () => {
      try {
        const sourceStatuses = await this.getSourceStatuses();

        // Check if any source became active or inactive
        const isSpotifyActive = sourceStatuses.spotify.isActive && this.spotify.isEnabled();
        const isAppleMusicActive = sourceStatuses.appleMusic.isActive && this.appleMusic.isEnabled();
        const isZoomActive = sourceStatuses.zoom.isActive && this.zoom.isEnabled();
        const isTeamsActive = sourceStatuses.teams.isActive && this.teams.isEnabled();
        const isHuddleActive = sourceStatuses.huddle.isActive && this.huddle.isEnabled();

        // Spotify: nur bei Message-Änderung prüfen ob wir setzen dürfen
        if (isSpotifyActive && sourceStatuses.spotify.message !== lastSpotifyMessage) {
          const canChange = await this.statusManager.isStatusClean();
          if (canChange) {
            lastSpotifyMessage = sourceStatuses.spotify.message!;
            await this.slackService.setProfile(
              sourceStatuses.spotify.emoji!,
              sourceStatuses.spotify.message!
            );
          }
        } else if (!isSpotifyActive && wasSpotifyActive) {
          await this.statusManager.reset();
          lastSpotifyMessage = '';
        }

        // Apple Music
        if (isAppleMusicActive && sourceStatuses.appleMusic.message !== lastAppleMusicMessage) {
          console.log('[polling] Apple Music message changed:', { 
            new: sourceStatuses.appleMusic.message,
            old: lastAppleMusicMessage 
          });
          const canChange = await this.statusManager.isStatusClean();
          console.log('[polling] Apple Music can change:', canChange);
          if (canChange) {
            lastAppleMusicMessage = sourceStatuses.appleMusic.message!;
            await this.slackService.setProfile(
              sourceStatuses.appleMusic.emoji!,
              sourceStatuses.appleMusic.message!
            );
            console.log('[polling] Apple Music status set');
          }
        } else if (!isAppleMusicActive && wasAppleMusicActive) {
          await this.statusManager.reset();
          lastAppleMusicMessage = '';
        }

        // Zoom
        if (isZoomActive && sourceStatuses.zoom.message !== lastZoomMessage) {
          const canChange = await this.statusManager.isStatusClean();
          if (canChange) {
            lastZoomMessage = sourceStatuses.zoom.message!;
            await this.slackService.setProfile(
              sourceStatuses.zoom.emoji!,
              sourceStatuses.zoom.message!
            );
          }
        }
        // Activate DND when meeting starts
        if (isZoomActive && !wasZoomActive) {
          console.log('[polling] Zoom meeting started, enabling DND...');
          await this.slackService.enableDND();
        }
        // Deactivate DND and reset when meeting ends
        if (!isZoomActive && wasZoomActive) {
          console.log('[polling] Zoom meeting ended, resetting status and disabling DND...');
          await this.slackService.disableDND();
          await this.statusManager.reset();
          lastZoomMessage = '';
        }

        // Teams
        if (isTeamsActive && sourceStatuses.teams.message !== lastTeamsMessage) {
          const canChange = await this.statusManager.isStatusClean();
          if (canChange) {
            lastTeamsMessage = sourceStatuses.teams.message!;
            await this.slackService.setProfile(
              sourceStatuses.teams.emoji!,
              sourceStatuses.teams.message!
            );
          }
        }
        // Activate DND when meeting starts
        if (isTeamsActive && !wasTeamsActive) {
          console.log('[polling] Teams meeting started, enabling DND...');
          await this.slackService.enableDND();
        }
        // Deactivate DND and reset when meeting ends
        if (!isTeamsActive && wasTeamsActive) {
          console.log('[polling] Teams meeting ended, resetting status and disabling DND...');
          await this.slackService.disableDND();
          await this.statusManager.reset();
          lastTeamsMessage = '';
        }

        // Huddle
        if (isHuddleActive && sourceStatuses.huddle.message !== lastHuddleMessage) {
          const canChange = await this.statusManager.isStatusClean();
          if (canChange) {
            lastHuddleMessage = sourceStatuses.huddle.message!;
            await this.slackService.setProfile(
              sourceStatuses.huddle.emoji!,
              sourceStatuses.huddle.message!
            );
          }
        }
        // Activate DND when meeting starts
        if (isHuddleActive && !wasHuddleActive) {
          console.log('[polling] Huddle started, enabling DND...');
          await this.slackService.enableDND();
        }
        // Deactivate DND and reset when meeting ends
        if (!isHuddleActive && wasHuddleActive) {
          console.log('[polling] Huddle ended, resetting status and disabling DND...');
          await this.slackService.disableDND();
          await this.statusManager.reset();
          lastHuddleMessage = '';
        }

        // Update state
        wasSpotifyActive = isSpotifyActive;
        wasAppleMusicActive = isAppleMusicActive;
        wasZoomActive = isZoomActive;
        wasTeamsActive = isTeamsActive;
        wasHuddleActive = isHuddleActive;
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
      } catch (error) {
        console.error('Error loading config:', error);
      }
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
        spotify: this.spotify.isEnabled(),
        appleMusic: this.appleMusic.isEnabled(),
        zoom: this.zoom.isEnabled(),
        teams: this.teams.isEnabled(),
        huddle: this.huddle.isEnabled(),
      },
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
