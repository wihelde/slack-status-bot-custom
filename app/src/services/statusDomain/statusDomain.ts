import { CustomStatusConfig, DayOfWeek, OverridableStatusPattern, STATUS_MESSAGES } from '../../config/statusConfig';
import { SlackProfile } from '../slack';
import { CorrectionPolicy } from './correctionPolicy';
import { DayStatusPlanner } from './dayStatusPlanner';
import { ManualStatusPlanner } from './manualStatusPlanner';
import { StatusChangePolicy } from './statusChangePolicy';
import { CorrectionDecision, DayStatusPlan, ManualAction, ManualActionPlan, ManualStatusPlan, ReconcilerStatusState } from './types';

export class StatusDomain {
  constructor(
    private readonly statusChangePolicy: StatusChangePolicy = new StatusChangePolicy(),
    private readonly dayStatusPlanner: DayStatusPlanner = new DayStatusPlanner(),
    private readonly manualStatusPlanner: ManualStatusPlanner = new ManualStatusPlanner(dayStatusPlanner),
    private readonly correctionPolicy: CorrectionPolicy = new CorrectionPolicy(statusChangePolicy),
  ) {}

  canChangeStatus(input: {
    profile: SlackProfile | null;
    state: ReconcilerStatusState;
    allowedEmojis: Set<string>;
    overridablePatterns: OverridableStatusPattern[];
  }): boolean {
    return this.statusChangePolicy.canChangeStatus(input);
  }

  getDayStatusPlan(day: DayOfWeek, customStatuses: CustomStatusConfig[]): DayStatusPlan | null {
    return this.dayStatusPlanner.getDayStatusPlan(day, customStatuses);
  }

  getManualStatusPlan(emoji: string): ManualStatusPlan {
    return this.manualStatusPlanner.getManualStatusPlan(emoji);
  }

  getManualActionPlan(action: ManualAction): ManualActionPlan | null {
    return this.manualStatusPlanner.getManualActionPlan(action);
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
    return this.correctionPolicy.getCorrectionDecision(input);
  }

  isManagedEmoji(emoji: string, allowedEmojis: Set<string>): boolean {
    return this.statusChangePolicy.isManagedEmoji(emoji, allowedEmojis);
  }

  buildAllowedEmojis(customStatuses: CustomStatusConfig[]): Set<string> {
    const statusEmojis = customStatuses.map(status => status.emoji);
    const sourceEmojis = [
      STATUS_MESSAGES.SPOTIFY_EMOJI,
      STATUS_MESSAGES.ZOOM_EMOJI,
      STATUS_MESSAGES.APPLE_MUSIC_EMOJI,
      STATUS_MESSAGES.DISCORD_EMOJI,
      STATUS_MESSAGES.TEAMS_EMOJI,
      STATUS_MESSAGES.SKYPE_EMOJI,
      STATUS_MESSAGES.HUDDLE_EMOJI,
    ];

    return new Set([...statusEmojis, ...sourceEmojis]);
  }

  buildDayStatusEmojiMap(customStatuses: CustomStatusConfig[]): Map<number, Set<string>> {
    const dayStatusEmojiMap = new Map<number, Set<string>>();

    for (let day = 0; day < 7; day++) {
      const emojisForDay = new Set(
        customStatuses
          .filter(status => status.days.includes(day as DayOfWeek))
          .map(status => status.emoji),
      );
      dayStatusEmojiMap.set(day, emojisForDay);
    }

    return dayStatusEmojiMap;
  }
}
