import { CustomStatusConfig, DayOfWeek } from '../../config/statusConfig';
import { protectedEmojis } from './constants';
import { DayStatusPlan } from './types';

export class DayStatusPlanner {
  getDayStatusPlan(day: DayOfWeek, customStatuses: CustomStatusConfig[]): DayStatusPlan | null {
    const dayStatuses = customStatuses.filter(status => status.days.includes(day));
    if (dayStatuses.length === 0) return null;

    const selectedStatus = dayStatuses[Math.floor(Math.random() * dayStatuses.length)];
    return {
      emoji: selectedStatus.emoji,
      message: selectedStatus.message,
      presence: selectedStatus.presence,
      enableDnd: selectedStatus.enableDND,
      stateValue: protectedEmojis.has(selectedStatus.emoji) ? 'not working' : '',
    };
  }
}
