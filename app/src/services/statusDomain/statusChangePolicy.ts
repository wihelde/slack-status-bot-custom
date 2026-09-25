import { OverridableStatusPattern, STATUS_MESSAGES } from '../../config/statusConfig';
import { SlackProfile } from '../slack';
import { managedEmojis } from './constants';
import { ReconcilerStatusState } from './types';

export class StatusChangePolicy {
  canChangeStatus(input: {
    profile: SlackProfile | null;
    state: ReconcilerStatusState;
    allowedEmojis: Set<string>;
    overridablePatterns: OverridableStatusPattern[];
  }): boolean {
    const { profile, state, allowedEmojis, overridablePatterns } = input;
    if (!profile) return false;

    const emoji = profile.status_emoji;
    const text = profile.status_text;

    if (state.userOwned) {
      return !emoji && !text;
    }

    if (state.value === 'not working') {
      return !emoji && !text;
    }

    if (this.isOverridableThirdPartyStatus(emoji, text, overridablePatterns)) {
      return true;
    }

    if (allowedEmojis.has(emoji)) return true;
    if (managedEmojis.has(emoji)) return true;
    if (emoji === STATUS_MESSAGES.MEETING_EMOJI && text === 'In a meeting • Outlook Calendar') return true;
    if (!emoji && !text) return true;

    return false;
  }

  isManagedEmoji(emoji: string, allowedEmojis: Set<string>): boolean {
    return managedEmojis.has(emoji) || allowedEmojis.has(emoji);
  }

  private isOverridableThirdPartyStatus(
    emoji: string,
    text: string,
    patterns: OverridableStatusPattern[],
  ): boolean {
    return patterns.some(pattern => emoji === pattern.emoji && pattern.messagePatterns.includes(text));
  }
}
