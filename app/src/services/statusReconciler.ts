import { CustomStatusConfig, DayOfWeek, OverridableStatusPattern, STATUS_MESSAGES } from '../config/statusConfig';
import { SlackProfile } from './slack';

export interface ReconcilerStatusState {
  value: 'not working' | '';
  activeSource?: string;
}

export interface DayStatusPlan {
  emoji: string;
  message: string;
  presence: 'auto' | 'away';
  enableDnd: boolean;
  stateValue: ReconcilerStatusState['value'];
}

export interface ManualStatusPlan {
  stateValue: ReconcilerStatusState['value'];
  activeSource: 'manual';
  presence?: 'auto' | 'away';
  dndAction: 'enable' | 'disable';
}

export type ManualAction =
  | { type: 'go-online'; day: DayOfWeek; customStatuses: CustomStatusConfig[] }
  | { type: 'go-away' }
  | { type: 'custom-status'; emoji: string; message: string; expiration?: number }
  | { type: 'holiday'; returnDateString: string };

export interface ManualActionPlan {
  emoji: string;
  message: string;
  expiration?: number;
  presence?: 'auto' | 'away';
  dndAction: 'enable' | 'disable' | 'ignore';
  stateValue: ReconcilerStatusState['value'];
  activeSource?: 'manual';
}

export interface CorrectionDecision {
  action: 'skip' | 'reset';
  nextState?: ReconcilerStatusState;
  reason:
    | 'source-active'
    | 'missing-profile'
    | 'empty-status'
    | 'holiday-protected'
    | 'holiday-expired'
    | 'protected-status'
    | 'overridable-third-party'
    | 'custom-user-status'
    | 'stale-source-status'
    | 'invalid-day-status'
    | 'valid-day-status';
}

export class StatusReconciler {
  private readonly protectedEmojis = new Set([
    STATUS_MESSAGES.OFF_EMOJI,
    STATUS_MESSAGES.SICK_EMOJI,
    STATUS_MESSAGES.HOLIDAY_EMOJI,
    STATUS_MESSAGES.PARENTAL_LEAVE_EMOJI,
  ]);

  private readonly managedEmojis = new Set([
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
    STATUS_MESSAGES.HOLIDAY_EMOJI,
    STATUS_MESSAGES.SICK_EMOJI,
    STATUS_MESSAGES.PARENTAL_LEAVE_EMOJI,
  ]);

  private readonly sourceEmojiMap: Record<string, string> = {
    [STATUS_MESSAGES.SPOTIFY_EMOJI]: 'spotify',
    [STATUS_MESSAGES.APPLE_MUSIC_EMOJI]: 'appleMusic',
    [STATUS_MESSAGES.ZOOM_EMOJI]: 'zoom',
    [STATUS_MESSAGES.TEAMS_EMOJI]: 'teams',
    [STATUS_MESSAGES.DISCORD_EMOJI]: 'discord',
    [STATUS_MESSAGES.SKYPE_EMOJI]: 'skype',
    [STATUS_MESSAGES.HUDDLE_EMOJI]: 'huddle',
  };

  canChangeStatus(input: {
    profile: SlackProfile | null;
    state: ReconcilerStatusState;
    allowedEmojis: Set<string>;
    overridablePatterns: OverridableStatusPattern[];
  }): boolean {
    const { profile, state, allowedEmojis, overridablePatterns } = input;
    if (!profile) return true;

    const emoji = profile.status_emoji;
    const text = profile.status_text;

    if (this.isOverridableThirdPartyStatus(emoji, text, overridablePatterns)) {
      return true;
    }

    if (state.value === 'not working') {
      if (!emoji && !text) return true;
      if (this.managedEmojis.has(emoji)) return false;
    }

    if (allowedEmojis.has(emoji)) return true;
    if (this.managedEmojis.has(emoji)) return true;
    if (emoji === ':spiral_calendar_pad:' && text === 'In a meeting • Outlook Calendar') return true;
    if (!emoji && !text) return true;

    return false;
  }

  getDayStatusPlan(day: DayOfWeek, customStatuses: CustomStatusConfig[]): DayStatusPlan | null {
    const dayStatuses = customStatuses.filter(status => status.days.includes(day));
    if (dayStatuses.length === 0) return null;

    const selectedStatus = dayStatuses[Math.floor(Math.random() * dayStatuses.length)];
    return {
      emoji: selectedStatus.emoji,
      message: selectedStatus.message,
      presence: selectedStatus.presence,
      enableDnd: selectedStatus.enableDND,
      stateValue: this.protectedEmojis.has(selectedStatus.emoji) ? 'not working' : '',
    };
  }

  getManualStatusPlan(emoji: string): ManualStatusPlan {
    const meetingEmojis = new Set([
      STATUS_MESSAGES.MEETING_EMOJI,
      STATUS_MESSAGES.REMEET_EMOJI,
      STATUS_MESSAGES.FOCUS_EMOJI,
    ]);
    const activeEmojis = new Set([
      STATUS_MESSAGES.BREAK_EMOJI,
      STATUS_MESSAGES.MEETING_EMOJI,
      STATUS_MESSAGES.FOCUS_EMOJI,
      STATUS_MESSAGES.REMEET_EMOJI,
    ]);
    const awayEmojis = new Set([
      STATUS_MESSAGES.SICK_EMOJI,
      STATUS_MESSAGES.HOLIDAY_EMOJI,
      STATUS_MESSAGES.TRAVEL_EMOJI,
      STATUS_MESSAGES.DOG_EMOJI,
      STATUS_MESSAGES.OFF_EMOJI,
    ]);

    return {
      stateValue: this.protectedEmojis.has(emoji) ? 'not working' : '',
      activeSource: 'manual',
      presence: activeEmojis.has(emoji) ? 'auto' : awayEmojis.has(emoji) ? 'away' : undefined,
      dndAction: meetingEmojis.has(emoji) ? 'enable' : 'disable',
    };
  }

  getManualActionPlan(action: ManualAction): ManualActionPlan | null {
    switch (action.type) {
      case 'go-online': {
        const dayStatusPlan = this.getDayStatusPlan(action.day, action.customStatuses);
        if (!dayStatusPlan) {
          return {
            emoji: '',
            message: '',
            presence: 'auto',
            dndAction: 'disable',
            stateValue: '',
          };
        }

        return {
          emoji: dayStatusPlan.emoji,
          message: dayStatusPlan.message,
          presence: dayStatusPlan.presence,
          dndAction: dayStatusPlan.enableDnd ? 'enable' : 'disable',
          stateValue: dayStatusPlan.stateValue,
        };
      }
      case 'go-away':
        return {
          emoji: STATUS_MESSAGES.OFF_EMOJI,
          message: this.getRandomOfflineMessage(),
          presence: 'away',
          dndAction: 'ignore',
          stateValue: 'not working',
        };
      case 'custom-status': {
        const manualStatusPlan = this.getManualStatusPlan(action.emoji);
        return {
          emoji: action.emoji,
          message: action.message,
          expiration: action.expiration ?? 0,
          presence: manualStatusPlan.presence,
          dndAction: manualStatusPlan.dndAction,
          stateValue: manualStatusPlan.stateValue,
          activeSource: manualStatusPlan.activeSource,
        };
      }
      case 'holiday': {
        const holidayPlan = this.getHolidayManualActionPlan(action.returnDateString);
        if (!holidayPlan) {
          return null;
        }

        return holidayPlan;
      }
    }
  }

  getCorrectionDecision(input: {
    profile: SlackProfile | null;
    state: ReconcilerStatusState;
    day: DayOfWeek;
    validEmojisForToday: Set<string>;
    allowedEmojis: Set<string>;
    overridablePatterns: OverridableStatusPattern[];
    now: number;
  }): CorrectionDecision {
    const { profile, state, day, validEmojisForToday, allowedEmojis, overridablePatterns, now } = input;

    if (state.activeSource) {
      return { action: 'skip', reason: 'source-active' };
    }

    if (!profile) {
      return { action: 'skip', reason: 'missing-profile' };
    }

    const emoji = profile.status_emoji;
    const text = profile.status_text;
    if (!emoji) {
      return { action: 'skip', reason: 'empty-status' };
    }

    if (state.value === 'not working') {
      if (emoji === STATUS_MESSAGES.HOLIDAY_EMOJI) {
        if (profile.status_expiration && profile.status_expiration > now) {
          return { action: 'skip', reason: 'holiday-protected' };
        }

        const nextState: ReconcilerStatusState = { value: '' };
        return { action: 'reset', reason: 'holiday-expired', nextState };
      }

      return { action: 'skip', reason: 'protected-status' };
    }

    if (this.isOverridableThirdPartyStatus(emoji, text, overridablePatterns)) {
      return { action: 'reset', reason: 'overridable-third-party' };
    }

    if (!this.isCurrentStatusManaged(emoji, allowedEmojis)) {
      return { action: 'skip', reason: 'custom-user-status' };
    }

    const sourceForEmoji = this.sourceEmojiMap[emoji];
    if (sourceForEmoji && state.activeSource !== sourceForEmoji) {
      return { action: 'reset', reason: 'stale-source-status' };
    }

    const hasValidEmojisForToday = validEmojisForToday.size > 0;
    const currentEmojiIsValid = validEmojisForToday.has(emoji);
    if ((hasValidEmojisForToday && !currentEmojiIsValid) || (!hasValidEmojisForToday && emoji)) {
      return { action: 'reset', reason: 'invalid-day-status' };
    }

    return { action: 'skip', reason: 'valid-day-status' };
  }

  isManagedEmoji(emoji: string, allowedEmojis: Set<string>): boolean {
    return this.isCurrentStatusManaged(emoji, allowedEmojis);
  }

  private isCurrentStatusManaged(emoji: string, allowedEmojis: Set<string>): boolean {
    return this.managedEmojis.has(emoji) || allowedEmojis.has(emoji);
  }

  private isOverridableThirdPartyStatus(emoji: string, text: string, patterns: OverridableStatusPattern[]): boolean {
    return patterns.some(pattern => emoji === pattern.emoji && pattern.messagePatterns.includes(text));
  }

  private getHolidayManualActionPlan(returnDateString: string): ManualActionPlan | null {
    const [day, month, year] = returnDateString.split('.').map(Number);
    if (!day || !month || !year || day < 1 || day > 31 || month < 1 || month > 12) {
      return null;
    }

    const returnDate = new Date(year, month - 1, day);
    const addDays = returnDate.getDay() === 5 ? 3 : 1;
    const backDate = new Date(returnDate);
    backDate.setDate(backDate.getDate() + addDays);

    const backDateStr = backDate.toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const expirationDate = new Date(backDate);
    expirationDate.setDate(expirationDate.getDate() - 1);
    expirationDate.setHours(23, 59, 59, 999);

    const customPlan = this.getManualStatusPlan(STATUS_MESSAGES.HOLIDAY_EMOJI);
    return {
      emoji: STATUS_MESSAGES.HOLIDAY_EMOJI,
      message: `${STATUS_MESSAGES.VACATION_MESSAGE} (back on ${backDateStr})`,
      expiration: Math.floor(expirationDate.getTime() / 1000),
      presence: customPlan.presence,
      dndAction: customPlan.dndAction,
      stateValue: customPlan.stateValue,
      activeSource: customPlan.activeSource,
    };
  }

  private getRandomOfflineMessage(): string {
    const messages = STATUS_MESSAGES.OFFLINE_MESSAGE_LIST;
    return messages[Math.floor(Math.random() * messages.length)];
  }
}
