import { SlackService, SlackProfile } from './slack';
import { STATUS_MESSAGES, DayOfWeek } from '../config/statusConfig';

export interface StatusCheckState {
  value: 'weekday' | 'monday' | 'friday' | 'weekend' | 'not working' | '';
}

/**
 * Status Manager
 * Handles status logic: reset, isStatusClean, day-based status updates
 */
export class StatusManager {
  private slackService: SlackService;
  private statusCheckState: StatusCheckState = { value: '' };
  private finalStatus: string = '';
  private allowedEmojis: Set<string>;
  private profileCache: SlackProfile | null = null;
  private profileCacheTime: number = 0;
  private readonly PROFILE_CACHE_TTL = 5000; // Cache profile for 5 seconds

  constructor(slackService: SlackService) {
    this.slackService = slackService;
    this.allowedEmojis = new Set(STATUS_MESSAGES.ON_EMOJI);
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

    // Managed emojis
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

    // When "not working" mode is active, block automatic status changes
    if (this.statusCheckState.value === 'not working') {
      // Only allow empty status or specific unmanaged statuses
      if (!emoji && !text) {
        return true;
      }
      // Block any managed emoji when "not working"
      if (managedEmojis.includes(emoji)) {
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
   * Reset status to default based on day of week
   */
  async reset(): Promise<boolean> {
    const dayOfWeek = this.getDayOfWeek();
    let emoji: string;
    let message: string;
    let stateValue: StatusCheckState['value'];

    if (dayOfWeek === DayOfWeek.MONDAY) {
      emoji = STATUS_MESSAGES.MONDAY_EMOJI;
      message = STATUS_MESSAGES.MONDAY_MESSAGE;
      stateValue = 'monday';
    } else if (dayOfWeek === DayOfWeek.FRIDAY) {
      emoji = STATUS_MESSAGES.TGIF_EMOJI;
      message = STATUS_MESSAGES.TGIF_MESSAGE;
      stateValue = 'friday';
    } else if (dayOfWeek === DayOfWeek.SATURDAY || dayOfWeek === DayOfWeek.SUNDAY) {
      emoji = STATUS_MESSAGES.OFF_EMOJI;
      message = this.getRandomOfflineMessage();
      stateValue = 'weekend';
    } else {
      // Weekday (Tue-Thu)
      emoji = this.getRandomOnEmoji();
      message = this.getRandomOnMessage();
      stateValue = 'weekday';
    }

    // Check if we can change status (same as Bash version)
    if (!await this.isStatusClean()) {
      return false;
    }

    // Set the new status
    const success = await this.slackService.setProfile(emoji, message);

    if (success) {
      this.statusCheckState.value = stateValue;
      this.finalStatus = message;
      this.invalidateProfileCache(); // Invalidate cache after status change
      
      // Set presence to auto and deactivate DND when resetting
      await this.slackService.setPresence('auto');
      await this.slackService.disableDND();
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

    if (dayOfWeek === DayOfWeek.MONDAY) {
      emoji = STATUS_MESSAGES.MONDAY_EMOJI;
      message = STATUS_MESSAGES.MONDAY_MESSAGE;
      stateValue = 'monday';
    } else if (dayOfWeek === DayOfWeek.FRIDAY) {
      emoji = STATUS_MESSAGES.TGIF_EMOJI;
      message = STATUS_MESSAGES.TGIF_MESSAGE;
      stateValue = 'friday';
    } else if (dayOfWeek === DayOfWeek.SATURDAY || dayOfWeek === DayOfWeek.SUNDAY) {
      emoji = STATUS_MESSAGES.OFF_EMOJI;
      message = this.getRandomOfflineMessage();
      stateValue = 'weekend';
    } else {
      // Weekday (Tue-Thu)
      emoji = this.getRandomOnEmoji();
      message = this.getRandomOnMessage();
      stateValue = 'weekday';
    }

    // Set the new status WITHOUT checking isStatusClean()
    const success = await this.slackService.setProfile(emoji, message);

    if (success) {
      this.statusCheckState.value = stateValue;
      this.finalStatus = message;
      this.invalidateProfileCache();
      
      // Set presence to auto and deactivate DND
      await this.slackService.setPresence('auto');
      await this.slackService.disableDND();
    }

    return success;
  }

  /**
   * Correct status based on day of week if needed
   */
  async correctStatus(): Promise<void> {
    const dayOfWeek = this.getDayOfWeek();
    const profile = await this.slackService.getProfile();

    if (!profile) return;

    const { status_emoji: emoji } = profile;

    // Check if we need to update based on day
    if (dayOfWeek === DayOfWeek.MONDAY && this.statusCheckState.value !== 'monday' && this.statusCheckState.value !== 'not working') {
      await this.reset();
    } else if (
      dayOfWeek >= DayOfWeek.TUESDAY && dayOfWeek <= DayOfWeek.THURSDAY &&
      this.statusCheckState.value !== 'weekday' &&
      this.statusCheckState.value !== 'not working'
    ) {
      await this.reset();
    } else if (dayOfWeek === DayOfWeek.FRIDAY && this.statusCheckState.value !== 'friday' && this.statusCheckState.value !== 'not working') {
      await this.reset();
    } else if (
      (dayOfWeek === DayOfWeek.SATURDAY || dayOfWeek === DayOfWeek.SUNDAY) &&
      this.statusCheckState.value !== 'weekend' &&
      this.statusCheckState.value !== 'not working'
    ) {
      await this.reset();
    }

    // Check if source-specific status should be reset
    if (!emoji) return;

    if (emoji === STATUS_MESSAGES.ZOOM_EMOJI && !this.statusCheckState.value?.includes('meeting')) {
      // Zoom emoji but not in meeting anymore
      await this.reset();
    } else if (emoji === STATUS_MESSAGES.SPOTIFY_EMOJI && !this.statusCheckState.value?.includes('spotify')) {
      // Spotify emoji but not playing
      await this.reset();
    }
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
    const success = await this.slackService.setProfile(
      STATUS_MESSAGES.OFF_EMOJI,
      this.getRandomOfflineMessage()
    );

    if (success) {
      this.statusCheckState.value = 'not working';
      this.invalidateProfileCache();
      // Set presence to away
      await this.slackService.setPresence('away');
    }

    return success;
  }

  /**
   * Set custom status (manual action - no isStatusClean check)
   */
  async setCustomStatus(emoji: string, message: string, expiration: number = 0): Promise<boolean> {
    // Direct set without isStatusClean check (manual action)
    const success = await this.slackService.setProfile(emoji, message, expiration);

    if (success) {
      this.statusCheckState.value = 'not working';
      this.finalStatus = message;
      this.invalidateProfileCache();
      
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

  // Private helper methods

  private getDayOfWeek(): DayOfWeek {
    const day = new Date().getDay();
    return day as DayOfWeek; // 0=Sunday, 1=Monday, ..., 6=Saturday
  }

  private getRandomOnEmoji(): string {
    const emojis = STATUS_MESSAGES.ON_EMOJI;
    return emojis[Math.floor(Math.random() * emojis.length)];
  }

  private getRandomOnMessage(): string {
    const messages = STATUS_MESSAGES.ON_MESSAGE;
    return messages[Math.floor(Math.random() * messages.length)];
  }

  private getRandomOfflineMessage(): string {
    const messages = STATUS_MESSAGES.OFFLINE_MESSAGE_LIST;
    return messages[Math.floor(Math.random() * messages.length)];
  }
}

