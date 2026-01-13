import { EventEmitter } from 'events';
import { SlackService, SlackProfile } from './slack';
import { STATUS_MESSAGES, DayOfWeek, CustomStatusConfig, getDefaultStatusConfiguration } from '../config/statusConfig';
import { logger } from '../utils/logger';

export interface StatusCheckState {
  value: 'not working' | '';
  activeSource?: string; // Track which source is currently active (e.g. 'zoom', 'teams', 'huddle')
}

/**
 * Status Manager
 * Handles status logic: reset, isStatusClean, day-based status updates
 * Emits events when status changes
 */
export class StatusManager extends EventEmitter {
  private slackService: SlackService;
  private statusCheckState: StatusCheckState = { value: '' };
  private finalStatus: string = '';
  private allowedEmojis: Set<string>;
  private customStatuses: CustomStatusConfig[];
  private profileCache: SlackProfile | null = null;
  private profileCacheTime: number = 0;
  private readonly PROFILE_CACHE_TTL = 5000; // Cache profile for 5 seconds

  constructor(slackService: SlackService, customStatuses?: CustomStatusConfig[]) {
    super(); // Call EventEmitter constructor
    this.slackService = slackService;
    this.customStatuses = customStatuses || getDefaultStatusConfiguration();
    
    // Build set of all valid emojis from custom statuses
    const statusEmojis = this.customStatuses.map(s => s.emoji);
    // Add source-specific emojis that are always managed
    const sourceEmojis = [
      STATUS_MESSAGES.SPOTIFY_EMOJI,
      STATUS_MESSAGES.ZOOM_EMOJI,
      STATUS_MESSAGES.APPLE_MUSIC_EMOJI,
      STATUS_MESSAGES.DISCORD_EMOJI,
      STATUS_MESSAGES.TEAMS_EMOJI,
      STATUS_MESSAGES.SKYPE_EMOJI,
      STATUS_MESSAGES.HUDDLE_EMOJI,
      // Note: OFF_EMOJI (:mobile_phone_off:) is intentionally NOT included - it should only be set manually via UI
    ];
    this.allowedEmojis = new Set([...statusEmojis, ...sourceEmojis]);
  }

  /**
   * Get cached profile to avoid excessive API calls
   */
  private async getCachedProfile(): Promise<SlackProfile | null> {
    const now = Date.now();
    if (this.profileCache && (now - this.profileCacheTime) < this.PROFILE_CACHE_TTL) {
      return this.profileCache;
    }
    
    const profile = await this.slackService.getProfile();
    if (profile) {
      this.profileCache = profile;
      this.profileCacheTime = now;
    }
    return profile;
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
   */
  async isStatusClean(): Promise<boolean> {
    const profile = await this.getCachedProfile();
    if (!profile) {
      return true; // Allow if we can't check
    }

    const { status_emoji: emoji, status_text: text } = profile;

    // Allow if status is one of our automatic messages
    if (this.allowedEmojis.has(emoji)) {
      return true;
    }

    // Managed emojis (that the daemon can automatically set)
    // Note: OFF_EMOJI (:mobile_phone_off:) is intentionally NOT included - it should only be set manually via UI
    const managedEmojis = [
      STATUS_MESSAGES.SPOTIFY_EMOJI,
      STATUS_MESSAGES.ZOOM_EMOJI,
      STATUS_MESSAGES.APPLE_MUSIC_EMOJI,
      STATUS_MESSAGES.MEETING_EMOJI,
      STATUS_MESSAGES.MONDAY_EMOJI,
      STATUS_MESSAGES.TGIF_EMOJI,
      STATUS_MESSAGES.DISCORD_EMOJI,
      STATUS_MESSAGES.TEAMS_EMOJI,
      STATUS_MESSAGES.SKYPE_EMOJI,
      STATUS_MESSAGES.REMEET_EMOJI,
      STATUS_MESSAGES.HUDDLE_EMOJI,
    ];

    // When "not working" mode is active, block automatic status changes
    if (this.statusCheckState.value === 'not working') {
      // Only allow empty status or specific unmanaged statuses
      if (!emoji && !text) {
        logger.debug(`[statusManager] isStatusClean: true (empty status in 'not working' mode)`);
        return true;
      }
      // Block any managed emoji when "not working"
      if (managedEmojis.includes(emoji)) {
        logger.warn(`[statusManager] isStatusClean: false (managed emoji in 'not working' mode)`, { emoji, state: this.statusCheckState.value });
        return false;
      }
    }

    // Allow if it's one of our managed emojis (when NOT in "not working" mode)
    if (managedEmojis.includes(emoji)) {
      return true;
    }

    // Allow if it's an Outlook meeting status
    if (emoji === ':spiral_calendar_pad:' && text === 'In a meeting • Outlook Calendar') {
      return true;
    }

    // Allow if status is empty
    if (!emoji && !text) {
      return true;
    }

    // Block if none of the above match
    return false;
  }

  /**
   * Get status for a specific day from custom configuration
   * Returns null if no status is configured for that day
   * If multiple statuses are configured for the day, returns a random one
   */
  private getStatusForDay(day: DayOfWeek): CustomStatusConfig | null {
    const dayStatuses = this.customStatuses.filter(s => s.days.includes(day));
    if (dayStatuses.length === 0) return null;
    // Return random one if multiple exist
    return dayStatuses[Math.floor(Math.random() * dayStatuses.length)];
  }

  /**
   * Reset status to default based on day of week
   */
  async reset(): Promise<boolean> {
    const dayOfWeek = this.getDayOfWeek();

    // Get status from configuration for this day
    const status = this.getStatusForDay(dayOfWeek);

    if (!status) {
      // No status configured for this day - set empty status
      logger.info(`[statusManager] No status configured for ${DayOfWeek[dayOfWeek]}, setting empty status`);
      const success = await this.slackService.setProfile('', '');
      if (success) {
        this.statusCheckState.value = '';
        this.finalStatus = '';
        this.invalidateProfileCache();
        this.emit('statusChanged', { emoji: '', message: '', stateValue: '' });
      }
      return success;
    }

    const emoji = status.emoji;
    const message = status.message;
    
    // Check if the emoji is a protected status that requires 'not working' mode
    const protectedEmojis = [
      STATUS_MESSAGES.OFF_EMOJI,
      STATUS_MESSAGES.SICK_EMOJI,
      STATUS_MESSAGES.HOLIDAY_EMOJI,
      STATUS_MESSAGES.PARENTAL_LEAVE_EMOJI,
    ];
    const stateValue: StatusCheckState['value'] = protectedEmojis.includes(emoji) ? 'not working' : '';

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
    const success = await this.slackService.setProfile(emoji, message);

    if (success) {
      this.statusCheckState.value = stateValue;
      this.finalStatus = message;
      this.invalidateProfileCache(); // Invalidate cache after status change
      
      logger.info(`[statusManager] reset() successful`, { newState: stateValue, emoji });
      
      // Handle presence and DND based on config
      await this.slackService.setPresence(status.presence);
      if (status.enableDND) {
        await this.slackService.enableDND();
      } else {
        await this.slackService.disableDND();
      }
      
      // Emit event for status change
      this.emit('statusChanged', { emoji, message, stateValue });
    } else {
      logger.error(`[statusManager] reset() failed to set profile`);
    }

    return success;
  }

  /**
   * Reset status without checking if it's allowed (for manual actions)
   */
  async resetWithoutCheck(): Promise<boolean> {
    const dayOfWeek = this.getDayOfWeek();
    let emoji: string;
    let message: string;
    let stateValue: StatusCheckState['value'];
    let presence: 'auto' | 'away' = 'auto';
    let enableDND: boolean = false;

    // Get status from configuration for this day (works for ALL days now)
    const status = this.getStatusForDay(dayOfWeek);

    if (status) {
      emoji = status.emoji;
      message = status.message;
      presence = status.presence;
      enableDND = status.enableDND;
      
      // Check if this is a protected status
      const protectedEmojis = [
        STATUS_MESSAGES.OFF_EMOJI,
        STATUS_MESSAGES.SICK_EMOJI,
        STATUS_MESSAGES.HOLIDAY_EMOJI,
        STATUS_MESSAGES.PARENTAL_LEAVE_EMOJI,
      ];
      stateValue = protectedEmojis.includes(emoji) ? 'not working' : '';
    } else {
      // No status configured for this day - set empty status
      emoji = '';
      message = '';
      stateValue = '';
      presence = 'auto';
      enableDND = false;
    }

    // Set the new status WITHOUT checking isStatusClean()
    const success = await this.slackService.setProfile(emoji, message);

    if (success) {
      this.statusCheckState.value = stateValue;
      this.finalStatus = message;
      this.invalidateProfileCache();
      
      // Set presence and DND based on config
      await this.slackService.setPresence(presence);
      if (enableDND) {
        await this.slackService.enableDND();
      } else {
        await this.slackService.disableDND();
      }
      
      // Emit event for status change
      this.emit('statusChanged', { emoji, message, stateValue });
    }

    return success;
  }

  /**
   * Correct status based on day of week if needed
   */
  async correctStatus(): Promise<void> {
    // Don't correct status if a source is actively running
    if (this.statusCheckState.activeSource) {
      logger.debug(`[statusManager] correctStatus: Skipping because source is active`, { activeSource: this.statusCheckState.activeSource });
      return;
    }

    // Don't correct status if 'not working' mode is active (user has set a protected status like sick, holiday, off)
    if (this.statusCheckState.value === 'not working') {
      logger.debug(`[statusManager] correctStatus: Skipping because 'not working' mode is active`);
      return;
    }

    const dayOfWeek = this.getDayOfWeek();
    const profile = await this.slackService.getProfile();

    if (!profile) return;

    const { status_emoji: emoji } = profile;

    // Don't correct status if user has set a custom (non-managed) status
    if (emoji && !this.isCurrentStatusManaged(emoji)) {
      logger.debug(`[statusManager] correctStatus: Skipping because user has set a custom status`, { emoji });
      return;
    }

    // Get the configured status for this day
    const dayStatus = this.getStatusForDay(dayOfWeek);
    
    // Check if we need to update to the day-based status
    if (dayStatus && emoji !== dayStatus.emoji) {
      logger.info(`[statusManager] correctStatus: Day-based status needs update`, { currentEmoji: emoji, targetEmoji: dayStatus.emoji, day: DayOfWeek[dayOfWeek] });
      await this.reset();
      return;
    }

    // Check if source-specific status should be reset
    if (!emoji) return;

    if (emoji === STATUS_MESSAGES.ZOOM_EMOJI && !this.statusCheckState.value?.includes('meeting')) {
      logger.info(`[statusManager] correctStatus: Zoom emoji detected but no meeting active, resetting`);
      await this.reset();
    } else if (emoji === STATUS_MESSAGES.SPOTIFY_EMOJI && !this.statusCheckState.value?.includes('spotify')) {
      logger.info(`[statusManager] correctStatus: Spotify emoji detected but no music playing, resetting`);
      await this.reset();
    } else if (emoji === STATUS_MESSAGES.APPLE_MUSIC_EMOJI && !this.statusCheckState.value?.includes('apple_music')) {
      logger.info(`[statusManager] correctStatus: Apple Music emoji detected but no music playing, resetting`);
      await this.reset();
    }
    // Add similar checks for other active sources (TEAMS, DISCORD, HUDDLE, etc.) if needed
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
    // Direct set without isStatusClean check (manual action)
    const message = this.getRandomOfflineMessage();
    const success = await this.slackService.setProfile(
      STATUS_MESSAGES.OFF_EMOJI,
      message
    );

    if (success) {
      this.statusCheckState.value = 'not working';
      this.invalidateProfileCache();
      // Set presence to away
      await this.slackService.setPresence('away');
      
      // Emit event for status change
      this.emit('statusChanged', { 
        emoji: STATUS_MESSAGES.OFF_EMOJI, 
        message,
        stateValue: 'not working' 
      });
    }

    return success;
  }

  /**
   * Set holiday status with automatic expiration
   * Parses DD.MM.YYYY date, adds 1 day (3 days if Friday)
   */
  async setHoliday(returnDateString: string): Promise<boolean> {
    try {
      // Parse DD.MM.YYYY format
      const [day, month, year] = returnDateString.split('.').map(Number);
      
      if (!day || !month || !year || day < 1 || day > 31 || month < 1 || month > 12) {
        logger.error(`[statusManager] Invalid date format: ${returnDateString}`);
        return false;
      }

      const returnDate = new Date(year, month - 1, day);
      const dayOfWeek = returnDate.getDay();
      
      // Check if it's Friday (5)
      const addDays = dayOfWeek === 5 ? 3 : 1;
      
      // Calculate expiration date (back on date)
      const backDate = new Date(returnDate);
      backDate.setDate(backDate.getDate() + addDays);
      
      // Format back date as DD.MM.YYYY
      const backDateStr = backDate.toLocaleDateString('de-DE', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric' 
      });
      
      // Create message with vacation message and back date
      const message = `${STATUS_MESSAGES.VACATION_MESSAGE} (back on ${backDateStr})`;
      
      // Calculate expiration timestamp (end of the day BEFORE the back date)
      // This matches the Bash version: TIMESTAMP=$(date -j -v +"$((ADD_DAYS - 1))"d ...)
      const expirationDate = new Date(backDate);
      expirationDate.setDate(expirationDate.getDate() - 1); // Go back one day
      expirationDate.setHours(23, 59, 59, 999);
      const expirationTimestamp = Math.floor(expirationDate.getTime() / 1000);
      
      logger.info(`[statusManager] setHoliday: Setting holiday status`, { 
        returnDate: returnDateString, 
        backDate: backDateStr, 
        expiration: expirationTimestamp,
        message 
      });
      
      // Set the custom status with expiration
      return await this.setCustomStatus(
        STATUS_MESSAGES.HOLIDAY_EMOJI,
        message,
        expirationTimestamp
      );
    } catch (error) {
      logger.error(`[statusManager] setHoliday failed`, { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Set custom status (manual action - no isStatusClean check)
   */
  async setCustomStatus(emoji: string, message: string, expiration: number = 0): Promise<boolean> {
    // Direct set without isStatusClean check (manual action)
    const success = await this.slackService.setProfile(emoji, message, expiration);

    if (success) {
      this.finalStatus = message;
      this.invalidateProfileCache();
      
      // Statuses that should set statusCheckState to 'not working'
      const notWorkingEmojis = [
        STATUS_MESSAGES.OFF_EMOJI,           // off
        STATUS_MESSAGES.SICK_EMOJI,         // sick-on/sick-off
        STATUS_MESSAGES.HOLIDAY_EMOJI,      // holiday-on/holiday-off
        STATUS_MESSAGES.PARENTAL_LEAVE_EMOJI, // parental-leave
      ];
      
      // Meeting emojis that should pause notifications
      const meetingEmojis = [
        STATUS_MESSAGES.MEETING_EMOJI,
        STATUS_MESSAGES.REMEET_EMOJI,
        STATUS_MESSAGES.FOCUS_EMOJI,
      ];
      
      // "Active" statuses that should have presence 'auto'
      const activeEmojis = [
        STATUS_MESSAGES.BREAK_EMOJI,
        STATUS_MESSAGES.MEETING_EMOJI,
        STATUS_MESSAGES.FOCUS_EMOJI,
        STATUS_MESSAGES.REMEET_EMOJI,
      ];
      
      // "Away" statuses that should have presence 'away'
      const awayEmojis = [
        STATUS_MESSAGES.SICK_EMOJI,
        STATUS_MESSAGES.HOLIDAY_EMOJI,
        STATUS_MESSAGES.TRAVEL_EMOJI,
        STATUS_MESSAGES.DOG_EMOJI,
        STATUS_MESSAGES.OFF_EMOJI,
      ];
      
      // Only set 'not working' for specific statuses
      if (notWorkingEmojis.includes(emoji)) {
        this.statusCheckState.value = 'not working';
      }
      // For other statuses, leave the current status check state as is
      // (don't change it, like in Bash version)
      
      // Handle meeting statuses - enable DND
      if (meetingEmojis.includes(emoji)) {
        await this.slackService.enableDND();
      } else {
        // For all other statuses, disable DND
        await this.slackService.disableDND();
      }
      
      // Set presence based on emoji type
      if (activeEmojis.includes(emoji)) {
        await this.slackService.setPresence('auto');
      } else if (awayEmojis.includes(emoji)) {
        await this.slackService.setPresence('away');
      }
      
      // Emit event for status change
      this.emit('statusChanged', { emoji, message, stateValue: this.statusCheckState.value });
    }

    return success;
  }

  /**
   * Get current status check state
   */
  getStatusCheckState(): StatusCheckState {
    return this.statusCheckState;
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
    
    // Rebuild allowedEmojis set
    const statusEmojis = this.customStatuses.map(s => s.emoji);
    const sourceEmojis = [
      STATUS_MESSAGES.SPOTIFY_EMOJI,
      STATUS_MESSAGES.ZOOM_EMOJI,
      STATUS_MESSAGES.APPLE_MUSIC_EMOJI,
      STATUS_MESSAGES.DISCORD_EMOJI,
      STATUS_MESSAGES.TEAMS_EMOJI,
      STATUS_MESSAGES.SKYPE_EMOJI,
      STATUS_MESSAGES.HUDDLE_EMOJI,
    ];
    this.allowedEmojis = new Set([...statusEmojis, ...sourceEmojis]);
    
    logger.info('[statusManager] Custom statuses updated', { count: statuses.length });
  }

  // Private helper methods

  /**
   * Check if the current emoji is one of our managed emojis
   * (i.e., set by the daemon, not by the user manually)
   */
  private isCurrentStatusManaged(emoji: string): boolean {
    const managedEmojis = [
      STATUS_MESSAGES.SPOTIFY_EMOJI,
      STATUS_MESSAGES.ZOOM_EMOJI,
      STATUS_MESSAGES.APPLE_MUSIC_EMOJI,
      STATUS_MESSAGES.MEETING_EMOJI,
      STATUS_MESSAGES.MONDAY_EMOJI,
      STATUS_MESSAGES.TGIF_EMOJI,
      STATUS_MESSAGES.DISCORD_EMOJI,
      STATUS_MESSAGES.TEAMS_EMOJI,
      STATUS_MESSAGES.SKYPE_EMOJI,
      STATUS_MESSAGES.REMEET_EMOJI,
      STATUS_MESSAGES.OFF_EMOJI,
      STATUS_MESSAGES.HUDDLE_EMOJI,
    ];
    
    // Also check the allowedEmojis set (ON_STATUS_PAIRS)
    return managedEmojis.includes(emoji) || this.allowedEmojis.has(emoji);
  }

  private getDayOfWeek(): DayOfWeek {
    const day = new Date().getDay();
    return day as DayOfWeek; // 0=Sunday, 1=Monday, ..., 6=Saturday
  }

  private getRandomOnPair(): { emoji: string; message: string } {
    const pairs = STATUS_MESSAGES.ON_STATUS_PAIRS;
    return pairs[Math.floor(Math.random() * pairs.length)];
  }

  private getRandomOnEmoji(): string {
    return this.getRandomOnPair().emoji;
  }

  private getRandomOnMessage(): string {
    return this.getRandomOnPair().message;
  }

  private getRandomOfflineMessage(): string {
    const messages = STATUS_MESSAGES.OFFLINE_MESSAGE_LIST;
    return messages[Math.floor(Math.random() * messages.length)];
  }
}

