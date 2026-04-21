import { STATUS_MESSAGES } from '../../config/statusConfig';
import { protectedEmojis } from './constants';
import { DayStatusPlanner } from './dayStatusPlanner';
import { ManualAction, ManualActionPlan, ManualStatusPlan } from './types';

export class ManualStatusPlanner {
  constructor(private readonly dayStatusPlanner: DayStatusPlanner = new DayStatusPlanner()) {}

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
      stateValue: protectedEmojis.has(emoji) ? 'not working' : '',
      activeSource: 'manual',
      presence: activeEmojis.has(emoji) ? 'auto' : awayEmojis.has(emoji) ? 'away' : undefined,
      dndAction: meetingEmojis.has(emoji) ? 'enable' : 'disable',
    };
  }

  getManualActionPlan(action: ManualAction): ManualActionPlan | null {
    switch (action.type) {
      case 'go-online': {
        const dayStatusPlan = this.dayStatusPlanner.getDayStatusPlan(action.day, action.customStatuses);
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
      case 'holiday':
        return this.getHolidayManualActionPlan(action.returnDateString);
    }
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
