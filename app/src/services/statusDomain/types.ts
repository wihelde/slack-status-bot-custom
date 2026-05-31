import { CustomStatusConfig, DayOfWeek } from '../../config/statusConfig';

export interface ReconcilerStatusState {
  value: 'not working' | '';
  activeSource?: string;
  lastEmptySeen?: number;
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
    | 'empty-status-grace'
    | 'empty-status-no-default'
    | 'holiday-protected'
    | 'holiday-expired'
    | 'protected-status'
    | 'overridable-third-party'
    | 'custom-user-status'
    | 'stale-source-status'
    | 'invalid-day-status'
    | 'valid-day-status';
}
