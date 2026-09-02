import { describe, expect, it } from 'vitest';
import { DayOfWeek, STATUS_MESSAGES } from '../../config/statusConfig';
import { CorrectionPolicy } from '../statusDomain/correctionPolicy';
import { DayStatusPlanner } from '../statusDomain/dayStatusPlanner';
import { ManualStatusPlanner } from '../statusDomain/manualStatusPlanner';
import { StatusChangePolicy } from '../statusDomain/statusChangePolicy';

describe('status domain boundaries', () => {
  it('blocks automatic status changes when the Slack profile is unavailable', () => {
    const policy = new StatusChangePolicy();

    expect(policy.canChangeStatus({
      profile: null,
      state: { value: 'not working' },
      allowedEmojis: new Set(),
      overridablePatterns: [],
    })).toBe(false);
  });

  it('blocks managed holiday status changes while in not working mode', () => {
    const policy = new StatusChangePolicy();

    const result = policy.canChangeStatus({
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

  it('recognizes configured overridable third-party statuses', () => {
    const policy = new StatusChangePolicy();

    expect(
      policy.canChangeStatus({
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
      }),
    ).toBe(true);
  });

  it('recognizes custom overridable patterns through the policy boundary', () => {
    const policy = new StatusChangePolicy();

    expect(
      policy.canChangeStatus({
        profile: {
          status_emoji: ':custom_tool:',
          status_text: 'Status from Custom Tool',
        },
        state: { value: '' },
        allowedEmojis: new Set(),
        overridablePatterns: [
          {
            emoji: ':custom_tool:',
            messagePatterns: ['Status from Custom Tool'],
          },
        ],
      }),
    ).toBe(true);
  });

  it('does not treat arbitrary custom statuses as overridable', () => {
    const policy = new StatusChangePolicy();

    expect(
      policy.canChangeStatus({
        profile: {
          status_emoji: ':custom_manual:',
          status_text: 'My custom status',
        },
        state: { value: '' },
        allowedEmojis: new Set(),
        overridablePatterns: [
          {
            emoji: ':office:',
            messagePatterns: ['Office Hamburg (via Officely)'],
          },
        ],
      }),
    ).toBe(false);
  });

  it('derives protected day status plans', () => {
    const planner = new DayStatusPlanner();

    const plan = planner.getDayStatusPlan(DayOfWeek.MONDAY, [
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

  it('derives holiday manual action with expiration metadata', () => {
    const planner = new ManualStatusPlanner();

    const plan = planner.getManualActionPlan({
      type: 'holiday',
      returnDateString: '14.04.2026',
    });

    expect(plan).toEqual(
      expect.objectContaining({
        emoji: STATUS_MESSAGES.HOLIDAY_EMOJI,
        stateValue: 'not working',
        activeSource: 'manual',
        dndAction: 'disable',
      }),
    );
    expect(plan?.message).toContain('back on');
    expect(plan?.expiration).toBeTypeOf('number');
  });

  it('derives holiday back date as the next day for non-Friday return dates', () => {
    const planner = new ManualStatusPlanner();

    const plan = planner.getManualActionPlan({
      type: 'holiday',
      returnDateString: '24.11.2025',
    });

    expect(plan?.message).toContain('25.11.2025');
  });

  it('treats manual off status as protected because it is not a managed emoji', () => {
    const policy = new StatusChangePolicy();

    const result = policy.canChangeStatus({
      profile: {
        status_emoji: STATUS_MESSAGES.OFF_EMOJI,
        status_text: 'Custom away message',
      },
      state: { value: '' },
      allowedEmojis: new Set(),
      overridablePatterns: [],
    });

    expect(result).toBe(false);
  });

  it('requests reset when holiday expiration has ended', () => {
    const policy = new CorrectionPolicy();

    const decision = policy.getCorrectionDecision({
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

  it('keeps protected non-holiday statuses untouched during correction', () => {
    const policy = new CorrectionPolicy();

    const decision = policy.getCorrectionDecision({
      profile: {
        status_emoji: STATUS_MESSAGES.SICK_EMOJI,
        status_text: 'Out sick',
        status_expiration: 0,
      },
      state: { value: 'not working' },
      day: DayOfWeek.MONDAY,
      validEmojisForToday: new Set([STATUS_MESSAGES.MONDAY_EMOJI]),
      allowedEmojis: new Set([STATUS_MESSAGES.MONDAY_EMOJI]),
      overridablePatterns: [],
      now: Math.floor(Date.now() / 1000),
    });

    expect(decision).toEqual({
      action: 'skip',
      reason: 'protected-status',
    });
  });
});
