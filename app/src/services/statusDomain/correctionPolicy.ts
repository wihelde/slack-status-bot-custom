import { DayOfWeek, OverridableStatusPattern, STATUS_MESSAGES } from '../../config/statusConfig';
import { SlackProfile } from '../slack';
import { sourceEmojiMap } from './constants';
import { StatusChangePolicy } from './statusChangePolicy';
import { CorrectionDecision, ReconcilerStatusState } from './types';

export class CorrectionPolicy {
  constructor(private readonly statusChangePolicy: StatusChangePolicy = new StatusChangePolicy()) {}

  private static readonly EMPTY_STATUS_GRACE_PERIOD = 10 * 60; // 10 minutes in seconds

  getCorrectionDecision(input: {
    profile: SlackProfile | null;
    state: ReconcilerStatusState;
    day: DayOfWeek;
    validEmojisForToday: Set<string>;
    allowedEmojis: Set<string>;
    overridablePatterns: OverridableStatusPattern[];
    now: number;
  }): CorrectionDecision {
    const { profile, state, validEmojisForToday, allowedEmojis, overridablePatterns, now } = input;

    if (state.activeSource) {
      return { action: 'skip', reason: 'source-active' };
    }

    if (!profile) {
      return { action: 'skip', reason: 'missing-profile' };
    }

    const emoji = profile.status_emoji;
    const text = profile.status_text;
    if (!emoji) {
      if (validEmojisForToday.size === 0) {
        return { action: 'skip', reason: 'empty-status-no-default' };
      }

      if (!state.lastEmptySeen) {
        const nextState: ReconcilerStatusState = { ...state, lastEmptySeen: now };
        return { action: 'skip', reason: 'empty-status-grace', nextState };
      }

      const elapsed = now - state.lastEmptySeen;
      if (elapsed < CorrectionPolicy.EMPTY_STATUS_GRACE_PERIOD) {
        return { action: 'skip', reason: 'empty-status-grace' };
      }

      const nextState: ReconcilerStatusState = { ...state, lastEmptySeen: undefined };
      return { action: 'reset', reason: 'empty-status', nextState };
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

    if (!this.statusChangePolicy.isManagedEmoji(emoji, allowedEmojis)) {
      return { action: 'skip', reason: 'custom-user-status' };
    }

    const sourceForEmoji = sourceEmojiMap[emoji];
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

  private isOverridableThirdPartyStatus(
    emoji: string,
    text: string,
    patterns: OverridableStatusPattern[],
  ): boolean {
    return patterns.some(pattern => emoji === pattern.emoji && pattern.messagePatterns.includes(text));
  }
}
