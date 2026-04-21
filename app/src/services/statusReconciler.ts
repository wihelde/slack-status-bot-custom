import { CustomStatusConfig, DayOfWeek, OverridableStatusPattern } from '../config/statusConfig';
import { SlackProfile } from './slack';
import { StatusDomain } from './statusDomain/statusDomain';
import type {
  CorrectionDecision,
  DayStatusPlan,
  ManualAction,
  ManualActionPlan,
  ManualStatusPlan,
  ReconcilerStatusState,
} from './statusDomain/types';
export type {
  CorrectionDecision,
  DayStatusPlan,
  ManualAction,
  ManualActionPlan,
  ManualStatusPlan,
  ReconcilerStatusState,
} from './statusDomain/types';

export class StatusReconciler {
  private readonly statusDomain: StatusDomain;

  constructor(statusDomain: StatusDomain = new StatusDomain()) {
    this.statusDomain = statusDomain;
  }

  canChangeStatus(input: {
    profile: SlackProfile | null;
    state: ReconcilerStatusState;
    allowedEmojis: Set<string>;
    overridablePatterns: OverridableStatusPattern[];
  }): boolean {
    return this.statusDomain.canChangeStatus(input);
  }

  getDayStatusPlan(day: DayOfWeek, customStatuses: CustomStatusConfig[]): DayStatusPlan | null {
    return this.statusDomain.getDayStatusPlan(day, customStatuses);
  }

  getManualStatusPlan(emoji: string): ManualStatusPlan {
    return this.statusDomain.getManualStatusPlan(emoji);
  }

  getManualActionPlan(action: ManualAction): ManualActionPlan | null {
    return this.statusDomain.getManualActionPlan(action);
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
    return this.statusDomain.getCorrectionDecision(input);
  }

  isManagedEmoji(emoji: string, allowedEmojis: Set<string>): boolean {
    return this.statusDomain.isManagedEmoji(emoji, allowedEmojis);
  }
}
