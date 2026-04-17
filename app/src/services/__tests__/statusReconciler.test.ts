import { describe, expect, it } from 'vitest';
import { DayOfWeek, STATUS_MESSAGES } from '../../config/statusConfig';
import { StatusReconciler } from '../statusReconciler';

describe('StatusReconciler', () => {
  const reconciler = new StatusReconciler();

  it('should block managed holiday status changes while in not working mode', () => {
    const result = reconciler.canChangeStatus({
      profile: {
        status_emoji: STATUS_MESSAGES.HOLIDAY_EMOJI,
        status_text: 'strong vacationing',
      },
      state: { value: 'not working' },
      allowedEmojis: new Set([STATUS_MESSAGES.HOLIDAY_EMOJI]),
      overridablePatterns: [],
    });

    expect(result).toBe(false);
  });

  it('should allow overridable third-party statuses', () => {
    const result = reconciler.canChangeStatus({
      profile: {
        status_emoji: ':office:',
        status_text: 'Office Hamburg (via Officely)',
      },
      state: { value: '' },
      allowedEmojis: new Set(),
      overridablePatterns: [
        {
          emoji: ':office:',
          messagePatterns: ['Office Hamburg (via Officely)'],
        },
      ],
    });

    expect(result).toBe(true);
  });

  it('should derive protected day status plans', () => {
    const plan = reconciler.getDayStatusPlan(DayOfWeek.MONDAY, [
      {
        id: 'sick-monday',
        emoji: STATUS_MESSAGES.SICK_EMOJI,
        message: 'Sick',
        days: [DayOfWeek.MONDAY],
        enableDND: false,
        presence: 'away',
        category: 'day_based',
      },
    ]);

    expect(plan).toEqual({
      emoji: STATUS_MESSAGES.SICK_EMOJI,
      message: 'Sick',
      presence: 'away',
      enableDnd: false,
      stateValue: 'not working',
    });
  });

  it('should derive meeting manual status side effects', () => {
    const plan = reconciler.getManualStatusPlan(STATUS_MESSAGES.MEETING_EMOJI);

    expect(plan).toEqual({
      stateValue: '',
      activeSource: 'manual',
      presence: 'auto',
      dndAction: 'enable',
    });
  });

  it('should derive go-online action from the current day configuration', () => {
    const plan = reconciler.getManualActionPlan({
      type: 'go-online',
      day: DayOfWeek.MONDAY,
      customStatuses: [
        {
          id: 'monday',
          emoji: STATUS_MESSAGES.MONDAY_EMOJI,
          message: 'Monday vibes',
          days: [DayOfWeek.MONDAY],
          enableDND: false,
          presence: 'auto',
          category: 'day_based',
        },
      ],
    });

    expect(plan).toEqual({
      emoji: STATUS_MESSAGES.MONDAY_EMOJI,
      message: 'Monday vibes',
      presence: 'auto',
      dndAction: 'disable',
      stateValue: '',
    });
  });

  it('should derive holiday manual action with expiration metadata', () => {
    const plan = reconciler.getManualActionPlan({
      type: 'holiday',
      returnDateString: '14.04.2026',
    });

    expect(plan).toEqual(
      expect.objectContaining({
        emoji: STATUS_MESSAGES.HOLIDAY_EMOJI,
        stateValue: 'not working',
        activeSource: 'manual',
        dndAction: 'disable',
      })
    );
    expect(plan?.message).toContain('back on');
    expect(plan?.expiration).toBeTypeOf('number');
  });

  it('should request reset when holiday expiration has ended', () => {
    const decision = reconciler.getCorrectionDecision({
      profile: {
        status_emoji: STATUS_MESSAGES.HOLIDAY_EMOJI,
        status_text: 'strong vacationing',
        status_expiration: Math.floor(Date.now() / 1000) - 60,
      },
      state: { value: 'not working' },
      day: DayOfWeek.MONDAY,
      validEmojisForToday: new Set([STATUS_MESSAGES.MONDAY_EMOJI]),
      allowedEmojis: new Set([STATUS_MESSAGES.MONDAY_EMOJI]),
      overridablePatterns: [],
      now: Math.floor(Date.now() / 1000),
    });

    expect(decision).toEqual({
      action: 'reset',
      reason: 'holiday-expired',
      nextState: { value: '' },
    });
  });
});
