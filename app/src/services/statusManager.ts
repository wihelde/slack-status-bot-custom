import { EventEmitter } from 'events';
import { SlackService, SlackProfile } from './slack';
import { SlackStatusExecutor } from './slackStatusExecutor';
import { DayOfWeek, CustomStatusConfig, getDefaultStatusConfiguration, DEFAULT_OVERRIDABLE_PATTERNS, OverridableStatusPattern } from '../config/statusConfig';
import type { AppStatusChangedEvent } from '../contracts/ipc';
import { StatusDomain } from './statusDomain/statusDomain';
import type { ManualAction } from './statusDomain/types';
import { logger } from '../utils/logger';

export interface StatusCheckState {
  value: 'not working' | '';
  activeSource?: string; // Track which source is currently active (e.g. 'zoom', 'teams', 'huddle')
  lastEmptySeen?: number;
}

/**
 * Status Manager
 * Handles status logic: reset, isStatusClean, day-based status updates
 * Emits events when status changes
 */
export class StatusManager extends EventEmitter {
  private slackService: SlackService;
  private slackExecutor: SlackStatusExecutor;
  private statusCheckState: StatusCheckState = { value: '' };
  private finalStatus: string = '';
  private allowedEmojis: Set<string> = new Set();
  private customStatuses: CustomStatusConfig[];
  private profileCache: SlackProfile | null = null;
  private profileCacheTime: number = 0;
  private readonly PROFILE_CACHE_TTL = 5000; // Cache profile for 5 seconds
  private dayStatusEmojiMap: Map<number, Set<string>> = new Map(); // Maps DayOfWeek → valid emoji set for that day
  private overridablePatterns: OverridableStatusPattern[];
  private isResetting: boolean = false; // Prevent concurrent reset calls
  private readonly statusDomain: StatusDomain;

  constructor(slackService: SlackService, customStatuses?: CustomStatusConfig[]) {
    super(); // Call EventEmitter constructor
    this.slackService = slackService;
    this.slackExecutor = new SlackStatusExecutor(slackService);
    this.customStatuses = customStatuses || getDefaultStatusConfiguration();
    this.overridablePatterns = DEFAULT_OVERRIDABLE_PATTERNS;
    this.statusDomain = new StatusDomain();
    this.refreshDerivedStatusState();
  }

  /**
   * Build a mapping of which emojis are valid for each day
   */
  private buildDayStatusEmojiMap(): void {
    this.dayStatusEmojiMap = this.statusDomain.buildDayStatusEmojiMap(this.customStatuses);
  }

  private refreshDerivedStatusState(): void {
    this.allowedEmojis = this.statusDomain.buildAllowedEmojis(this.customStatuses);
    this.buildDayStatusEmojiMap();
  }

  /**
   * Set profile cache (mainly for testing)
   */
  setProfileCache(profile: SlackProfile | null): void {
    this.profileCache = profile;
    this.profileCacheTime = Date.now();
  }

  /**
   * Get cached profile to avoid excessive API calls
   */
  private async getCachedProfile(): Promise<SlackProfile | null> {
    const now = Date.now();
    if (this.profileCache && (now - this.profileCacheTime) < this.PROFILE_CACHE_TTL) {
      return this.profileCache;
    }
    
    const profile = await this.slackExecutor.getProfile();
    if (profile) {
      this.profileCache = profile;
      this.profileCacheTime = now;
    }
    return profile;
  }

  /**
   * Public method to get cached profile (for change detection in daemon)
   */
  async getLastKnownProfile(): Promise<SlackProfile | null> {
    return this.profileCache;
  }

  markObservedSourceActive(sourceName: string): void {
    this.statusCheckState = { ...this.statusCheckState, activeSource: sourceName };
  }

  clearObservedSourceActive(sourceName: string): void {
    if (this.statusCheckState.activeSource === sourceName) {
      this.statusCheckState = { ...this.statusCheckState, activeSource: undefined };
    }
  }

  async shouldApplyObservedStatus(emoji: string, message: string): Promise<boolean> {
    const canChange = await this.isStatusClean();
    if (!canChange) {
      return false;
    }

    const lastProfile = await this.getLastKnownProfile();
    return !lastProfile ||
      lastProfile.status_emoji !== emoji ||
      lastProfile.status_text !== message;
  }

  emitObservedStatusChange(emoji: string, message: string, stateValue: 'activeSource' | 'sourceInactive'): void {
    this.emit('statusChanged', { emoji, message, stateValue } satisfies AppStatusChangedEvent);
  }

  /**
   * Invalidate profile cache
   */
  private invalidateProfileCache(): void {
    this.profileCache = null;
    this.profileCacheTime = 0;
  }

  /**
   * Check if current status is "clean" (allowed to change)
   * Returns true if status can be changed, false if it's protected
   * 
   * CRITICAL: The order of checks matters! See ARCHITECTURE.md: "The isStatusClean() Decision Tree"
   * - 'not working' mode check MUST come BEFORE allowedEmojis check
   * - This protects Holiday status from being overridden by music/meeting sources
   */
  async isStatusClean(): Promise<boolean> {
    const profile = await this.getCachedProfile();
    const result = this.statusDomain.canChangeStatus({
      profile,
      state: this.statusCheckState,
      allowedEmojis: this.allowedEmojis,
      overridablePatterns: this.overridablePatterns,
    });
    logger.debug(`[statusManager] isStatusClean result`, {
      emoji: profile?.status_emoji,
      text: profile?.status_text,
      statusCheckStateValue: this.statusCheckState.value,
      result,
    });
    return result;
  }

  /**
   * Get status for a specific day from custom configuration
   * Returns null if no status is configured for that day
   * If multiple statuses are configured for the day, returns a random one
   */
  /**
   * Reset status to default based on day of week
   */
  async reset(): Promise<boolean> {
    // Prevent concurrent reset calls (race condition protection)
    if (this.isResetting) {
      logger.info(`[statusManager] reset() skipped - another reset is already in progress`);
      return true; // Return true to indicate "handled" (the other reset will do the job)
    }
    
    this.isResetting = true;
    
    try {
      return await this.performReset();
    } finally {
      this.isResetting = false;
    }
  }

  /**
   * Internal reset implementation (called by reset() with concurrency protection)
   * 
   * CRITICAL: Must check 'not working' mode at the START!
   * See ARCHITECTURE.md: "The performReset() Protection"
   * - If statusCheckState.value === 'not working', return FALSE immediately
   * - This prevents reset() from clearing Holiday status when Spotify stops
   */
  private async performReset(): Promise<boolean> {
    // Prevent resetting if 'not working' mode is active (user has set a protected status)
    if (this.statusCheckState.value === 'not working') {
      logger.warn(`[statusManager] performReset() blocked - 'not working' mode is active`, { currentState: this.statusCheckState.value });
      return false;
    }

    const dayOfWeek = this.getDayOfWeek();

    // Get status from configuration for this day
    const statusPlan = this.statusDomain.getDayStatusPlan(dayOfWeek, this.customStatuses);

    if (!statusPlan) {
      // No status configured for this day - set empty status
      logger.info(`[statusManager] No status configured for ${DayOfWeek[dayOfWeek]}, setting empty status`);
      const success = await this.slackExecutor.applyStatusChange({
        emoji: '',
        text: '',
        presence: 'auto',
        dndAction: 'disable',
      });
      if (success) {
        this.statusCheckState.value = '';
        this.statusCheckState.activeSource = undefined;
        this.finalStatus = '';
        this.invalidateProfileCache();
        this.emit('statusChanged', { emoji: '', message: '', stateValue: '' } satisfies AppStatusChangedEvent);
      }
      return success;
    }

    const emoji = statusPlan.emoji;
    const message = statusPlan.message;
    const stateValue = statusPlan.stateValue;

    logger.info(`[statusManager] reset() called`, { stateValue, emoji, currentState: this.statusCheckState.value });

    // Check if we can change status (same as Bash version)
    if (!await this.isStatusClean()) {
      // If status is blocked, check if the current status already matches the target emoji
      const profile = await this.getCachedProfile();
      if (profile && profile.status_emoji === emoji) {
        // Current status already matches the target, just sync the statusCheckState
        logger.info(`[statusManager] reset() blocked but current status already matches target, syncing state`, { stateValue, emoji });
        this.statusCheckState.value = stateValue;
        this.finalStatus = message;
        return true;
      }
      
      logger.warn(`[statusManager] reset() blocked by isStatusClean and current status doesn't match target`, { currentEmoji: profile?.status_emoji, targetEmoji: emoji });
      return false;
    }

    // Set the new status
    const success = await this.slackExecutor.applyStatusChange({
      emoji,
      text: message,
      presence: statusPlan.presence,
      dndAction: statusPlan.enableDnd ? 'enable' : 'disable',
    });

    if (success) {
      this.statusCheckState.value = stateValue;
      this.statusCheckState.activeSource = undefined;
      this.finalStatus = message;
      this.invalidateProfileCache(); // Invalidate cache after status change
      
      logger.info(`[statusManager] reset() successful`, { newState: stateValue, emoji });
      
      // Emit event for status change
      this.emit('statusChanged', { emoji, message, stateValue } satisfies AppStatusChangedEvent);
    } else {
      logger.error(`[statusManager] reset() failed to set profile`);
    }

    return success;
  }

  /**
   * Reset status without checking if it's allowed (for manual actions)
   */
  async resetWithoutCheck(): Promise<boolean> {
    return this.applyManualAction({
      type: 'go-online',
      day: this.getDayOfWeek(),
      customStatuses: this.customStatuses,
    });
  }

  /**
   * Correct status based on day of week if needed
   * 
   * Handles several cases:
   * 1. Skips if a source is actively running (Spotify, Zoom, etc.)
   * 2. Handles Holiday expiration: detects when Slack-side expiration passes and auto-clears 'not working' mode
   * 3. Corrects status if current emoji doesn't match the day configuration
   * 4. Respects user's custom/manual statuses
   * 
   * See ARCHITECTURE.md: "Flow 4: Holiday Expiration Ends"
   */
  async correctStatus(): Promise<void> {
    // Don't correct status if a source is actively running
    if (this.statusCheckState.activeSource) {
      logger.debug(`[statusManager] correctStatus: Skipping because source is active`, { activeSource: this.statusCheckState.activeSource });
      return;
    }

    // Use cached profile, or fetch fresh if cache is empty
    let profile = this.profileCache;
    if (!profile) {
      profile = await this.getCachedProfile();
    }
    
    if (!profile) {
      logger.debug(`[statusManager] correctStatus: No profile available, skipping`);
      return;
    }

    const emoji = profile.status_emoji;
    const text = profile.status_text;

    if (emoji && this.statusCheckState.lastEmptySeen) {
      this.statusCheckState = { ...this.statusCheckState, lastEmptySeen: undefined };
    }

    const dayOfWeek = this.getDayOfWeek();
    const validEmojisForToday = this.dayStatusEmojiMap.get(dayOfWeek) || new Set();
    const decision = this.statusDomain.getCorrectionDecision({
      profile,
      state: this.statusCheckState,
      day: dayOfWeek,
      validEmojisForToday,
      allowedEmojis: this.allowedEmojis,
      overridablePatterns: this.overridablePatterns,
      now: Math.floor(Date.now() / 1000),
    });

    if (decision.nextState) {
      this.statusCheckState = decision.nextState;
    }

    if (decision.action === 'reset') {
      logger.info(`[statusManager] correctStatus: Reset required`, {
        emoji,
        text,
        reason: decision.reason,
        validEmojis: Array.from(validEmojisForToday),
        day: DayOfWeek[dayOfWeek],
      });
      await this.reset();
      return;
    }

    logger.debug(`[statusManager] correctStatus: No correction needed`, {
      emoji,
      day: DayOfWeek[dayOfWeek],
      reason: decision.reason,
    });
  }

  /**
   * Set status to "online" (manual action - no isStatusClean check)
   */
  async goOnline(): Promise<boolean> {
    return this.resetWithoutCheck();
  }

  /**
   * Set status to "away" (manual action - no isStatusClean check)
   */
  async goAway(): Promise<boolean> {
    return this.applyManualAction({ type: 'go-away' });
  }

  /**
   * Set holiday status with automatic expiration
   * Parses DD.MM.YYYY date, adds 1 day (3 days if Friday)
   */
  async setHoliday(returnDateString: string): Promise<boolean> {
    try {
      const success = await this.applyManualAction({ type: 'holiday', returnDateString });
      if (!success) {
        logger.error(`[statusManager] Invalid date format: ${returnDateString}`);
      }
      return success;
    } catch (error) {
      logger.error(`[statusManager] setHoliday failed`, { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Set custom status (manual action - no isStatusClean check)
   */
  async setCustomStatus(emoji: string, message: string, expiration: number = 0): Promise<boolean> {
    logger.info(`[statusManager] setCustomStatus called`, { emoji, message, expiration });
    return this.applyManualAction({
      type: 'custom-status',
      emoji,
      message,
      expiration,
    });
  }

  async runCorrectionCycle(): Promise<void> {
    await this.correctStatus();
  }

  /**
   * Get current status check state
   */
  getStatusCheckState(): StatusCheckState {
    return this.statusCheckState;
  }

  getCustomStatuses(): CustomStatusConfig[] {
    return [...this.customStatuses];
  }

  getOverridablePatterns(): OverridableStatusPattern[] {
    return [...this.overridablePatterns];
  }

  /**
   * Set status check state (e.g., from config/persistence)
   */
  setStatusCheckState(state: StatusCheckState): void {
    this.statusCheckState = state;
  }

  /**
   * Update custom statuses at runtime (called when user updates config in UI)
   */
  setCustomStatuses(statuses: CustomStatusConfig[]): void {
    this.customStatuses = statuses;
    
    this.refreshDerivedStatusState();
    
    logger.info('[statusManager] Custom statuses updated', { count: statuses.length });
  }

  /**
   * Update overridable status patterns at runtime
   */
  setOverridablePatterns(patterns: OverridableStatusPattern[]): void {
    this.overridablePatterns = patterns;
    logger.info('[statusManager] Overridable patterns updated', { count: patterns.length });
  }

  private getDayOfWeek(): DayOfWeek {
    const day = new Date().getDay();
    return day as DayOfWeek; // 0=Sunday, 1=Monday, ..., 6=Saturday
  }

  private async applyManualAction(action: ManualAction): Promise<boolean> {
    const actionPlan = this.statusDomain.getManualActionPlan(action);
    if (!actionPlan) {
      return false;
    }

    const success = await this.slackExecutor.applyStatusChange({
      emoji: actionPlan.emoji,
      text: actionPlan.message,
      expiration: actionPlan.expiration,
      presence: actionPlan.presence,
      dndAction: actionPlan.dndAction,
    });

    if (!success) {
      return false;
    }

    this.finalStatus = actionPlan.message;
    this.invalidateProfileCache();
    this.statusCheckState.value = actionPlan.stateValue;
    this.statusCheckState.activeSource = actionPlan.activeSource;

    if (actionPlan.stateValue === 'not working') {
      logger.info(`[statusManager] applyManualAction: set statusCheckState.value to 'not working'`, {
        emoji: actionPlan.emoji,
      });
    }

    this.emit('statusChanged', {
      emoji: actionPlan.emoji,
      message: actionPlan.message,
      stateValue: actionPlan.stateValue,
    } satisfies AppStatusChangedEvent);

    return true;
  }
}
