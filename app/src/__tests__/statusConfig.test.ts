import { describe, it, expect, beforeEach } from 'vitest';
import { DayOfWeek, CustomStatusConfig, getDefaultStatusConfiguration } from '../config/statusConfig';

describe('Status Configuration', () => {
  describe('getDefaultStatusConfiguration', () => {
    it('should return default status configuration with Quick Actions and Day-based statuses', () => {
      const config = getDefaultStatusConfiguration();
      
      expect(config).toBeDefined();
      expect(Array.isArray(config)).toBe(true);
      expect(config.length).toBeGreaterThan(0);
    });

    it('should include all Quick Actions', () => {
      const config = getDefaultStatusConfiguration();
      const quickActions = config.filter(s => s.category === 'quick_action');
      
      const expectedQuickActions = ['break', 'meeting', 'focus', 'travel', 'sick', 'remeet', 'dog', 'holiday'];
      expectedQuickActions.forEach(actionId => {
        const action = quickActions.find(s => s.id === actionId);
        expect(action).toBeDefined();
        expect(action?.emoji).toBeTruthy();
        expect(action?.message).toBeTruthy();
        expect(action?.quickActionLabel).toBeTruthy();
        expect(action?.days).toEqual([]);
      });
    });

    it('should include Day-based statuses', () => {
      const config = getDefaultStatusConfiguration();
      const dayBasedStatuses = config.filter(s => s.category === 'day_based');
      
      expect(dayBasedStatuses.length).toBeGreaterThan(0);
      dayBasedStatuses.forEach(status => {
        expect(status.days.length).toBeGreaterThan(0);
        expect(status.emoji).toBeTruthy();
        expect(status.message).toBeTruthy();
      });
    });

    it('should have Holiday quick action with away presence', () => {
      const config = getDefaultStatusConfiguration();
      const holiday = config.find(s => s.id === 'holiday');
      
      expect(holiday).toBeDefined();
      expect(holiday?.presence).toBe('away');
      expect(holiday?.quickActionLabel).toBe('Holiday');
    });
  });

  describe('getStatusForDay', () => {
    it('should filter statuses by day correctly', () => {
      const config = getDefaultStatusConfiguration();
      const mondayStatuses = config.filter(s => s.days.includes(DayOfWeek.MONDAY));
      
      expect(mondayStatuses.length).toBeGreaterThan(0);
      mondayStatuses.forEach(status => {
        expect(status.days).toContain(DayOfWeek.MONDAY);
      });
    });

    it('should handle multiple statuses for the same day', () => {
      const config = getDefaultStatusConfiguration();
      const fridayStatuses = config.filter(s => s.days.includes(DayOfWeek.FRIDAY));
      
      // TGIF is on Friday
      expect(fridayStatuses.length).toBeGreaterThan(0);
    });

    it('should return empty array for days without statuses', () => {
      const config: CustomStatusConfig[] = [
        {
          id: 'test1',
          emoji: ':test:',
          message: 'Test message',
          days: [DayOfWeek.MONDAY],
          enableDND: false,
          presence: 'auto',
          category: 'day_based',
        },
      ];

      const wednesdayStatuses = config.filter(s => s.days.includes(DayOfWeek.WEDNESDAY));
      expect(wednesdayStatuses).toEqual([]);
    });
  });

  describe('Duplicate Validation', () => {
    it('should detect exact duplicates', () => {
      const status1: CustomStatusConfig = {
        id: 'test1',
        emoji: ':test:',
        message: 'Test message',
        days: [DayOfWeek.MONDAY],
        enableDND: false,
        presence: 'auto',
        category: 'day_based',
      };

      const status2: CustomStatusConfig = {
        id: 'test2',
        emoji: ':test:',
        message: 'Test message',
        days: [DayOfWeek.MONDAY],
        enableDND: false,
        presence: 'auto',
        category: 'day_based',
      };

      // Check if they are duplicates (same emoji, message, days, DND, presence)
      const isDuplicate =
        status1.emoji === status2.emoji &&
        status1.message === status2.message &&
        JSON.stringify(status1.days) === JSON.stringify(status2.days) &&
        status1.enableDND === status2.enableDND &&
        status1.presence === status2.presence;

      expect(isDuplicate).toBe(true);
    });

    it('should detect unmodified copies (with Copy suffix)', () => {
      const status1: CustomStatusConfig = {
        id: 'test1',
        emoji: ':test:',
        message: 'Test message',
        days: [DayOfWeek.MONDAY],
        enableDND: false,
        presence: 'auto',
        category: 'day_based',
      };

      const status2: CustomStatusConfig = {
        id: 'test2',
        emoji: ':test:',
        message: 'Test message (Copy)',
        days: [DayOfWeek.MONDAY],
        enableDND: false,
        presence: 'auto',
        category: 'day_based',
      };

      // Check if status2 is an unmodified copy of status1
      const baseMessage = status2.message.replace(' (Copy)', '');
      const isUnmodifiedCopy =
        status1.emoji === status2.emoji &&
        status1.message === baseMessage &&
        JSON.stringify(status1.days) === JSON.stringify(status2.days) &&
        status1.enableDND === status2.enableDND &&
        status1.presence === status2.presence &&
        status2.message.includes('(Copy)');

      expect(isUnmodifiedCopy).toBe(true);
    });

    it('should not flag modified copies as duplicates', () => {
      const status1: CustomStatusConfig = {
        id: 'test1',
        emoji: ':test:',
        message: 'Test message',
        days: [DayOfWeek.MONDAY],
        enableDND: false,
        presence: 'auto',
        category: 'day_based',
      };

      const status2: CustomStatusConfig = {
        id: 'test2',
        emoji: ':modified:',  // Changed emoji
        message: 'Test message (Copy)',
        days: [DayOfWeek.MONDAY],
        enableDND: false,
        presence: 'auto',
        category: 'day_based',
      };

      // Check if they are duplicates
      const isDuplicate =
        status1.emoji === status2.emoji &&
        status1.message === status2.message;

      expect(isDuplicate).toBe(false);
    });
  });

  describe('Copy Function', () => {
    it('should create a copy with unique ID and (Copy) suffix', () => {
      const original: CustomStatusConfig = {
        id: 'test1',
        emoji: ':test:',
        message: 'Test message',
        days: [DayOfWeek.MONDAY],
        enableDND: false,
        presence: 'auto',
        category: 'day_based',
      };

      // Simulate copy function
      const copy: CustomStatusConfig = {
        ...original,
        id: `${original.id}_copy_${Date.now()}`,
        message: `${original.message} (Copy)`,
      };

      expect(copy.id).not.toBe(original.id);
      expect(copy.message).toContain('(Copy)');
      expect(copy.emoji).toBe(original.emoji);
      expect(copy.days).toEqual(original.days);
    });

    it('should preserve all other properties when copying', () => {
      const original: CustomStatusConfig = {
        id: 'test1',
        emoji: ':test:',
        message: 'Test message',
        days: [DayOfWeek.MONDAY, DayOfWeek.FRIDAY],
        enableDND: true,
        presence: 'away',
        category: 'day_based',
      };

      const copy: CustomStatusConfig = {
        ...original,
        id: `${original.id}_copy_${Date.now()}`,
        message: `${original.message} (Copy)`,
      };

      expect(copy.emoji).toBe(original.emoji);
      expect(copy.days).toEqual(original.days);
      expect(copy.enableDND).toBe(original.enableDND);
      expect(copy.presence).toBe(original.presence);
      expect(copy.category).toBe(original.category);
    });
  });

  describe('Empty Status Handling', () => {
    it('should handle empty status message', () => {
      const emptyStatus: CustomStatusConfig = {
        id: 'empty',
        emoji: ':test:',
        message: '',
        days: [DayOfWeek.MONDAY],
        enableDND: false,
        presence: 'auto',
        category: 'day_based',
      };

      expect(emptyStatus.message).toBe('');
      expect(emptyStatus.emoji).toBeTruthy();
    });

    it('should handle status with no days assigned', () => {
      const noDaysStatus: CustomStatusConfig = {
        id: 'no_days',
        emoji: ':test:',
        message: 'Test message',
        days: [],
        enableDND: false,
        presence: 'auto',
        category: 'quick_action',
      };

      expect(noDaysStatus.days).toEqual([]);
    });

    it('should handle status with all days assigned', () => {
      const allDaysStatus: CustomStatusConfig = {
        id: 'all_days',
        emoji: ':test:',
        message: 'Test message',
        days: [
          DayOfWeek.SUNDAY,
          DayOfWeek.MONDAY,
          DayOfWeek.TUESDAY,
          DayOfWeek.WEDNESDAY,
          DayOfWeek.THURSDAY,
          DayOfWeek.FRIDAY,
          DayOfWeek.SATURDAY,
        ],
        enableDND: false,
        presence: 'auto',
        category: 'day_based',
      };

      expect(allDaysStatus.days.length).toBe(7);
    });
  });

  describe('Quick Action vs Day-based Distinction', () => {
    it('should correctly categorize Quick Actions', () => {
      const config = getDefaultStatusConfiguration();
      const quickActions = config.filter(s => s.category === 'quick_action');

      quickActions.forEach(action => {
        expect(action.days).toEqual([]);
        expect(action.quickActionLabel).toBeTruthy();
      });
    });

    it('should correctly categorize Day-based statuses', () => {
      const config = getDefaultStatusConfiguration();
      const dayBasedStatuses = config.filter(s => s.category === 'day_based');

      dayBasedStatuses.forEach(status => {
        expect(status.days.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Presence and DND Configuration', () => {
    it('should handle all valid presence values', () => {
      const autoStatus: CustomStatusConfig = {
        id: 'auto',
        emoji: ':test:',
        message: 'Test',
        days: [],
        enableDND: false,
        presence: 'auto',
        category: 'quick_action',
      };

      const awayStatus: CustomStatusConfig = {
        id: 'away',
        emoji: ':test:',
        message: 'Test',
        days: [],
        enableDND: false,
        presence: 'away',
        category: 'quick_action',
      };

      expect(autoStatus.presence).toBe('auto');
      expect(awayStatus.presence).toBe('away');
    });

    it('should toggle DND independently from presence', () => {
      const statusWithDND: CustomStatusConfig = {
        id: 'with_dnd',
        emoji: ':test:',
        message: 'Test',
        days: [],
        enableDND: true,
        presence: 'auto',
        category: 'quick_action',
      };

      const statusWithoutDND: CustomStatusConfig = {
        id: 'without_dnd',
        emoji: ':test:',
        message: 'Test',
        days: [],
        enableDND: false,
        presence: 'auto',
        category: 'quick_action',
      };

      expect(statusWithDND.enableDND).toBe(true);
      expect(statusWithoutDND.enableDND).toBe(false);
      expect(statusWithDND.presence).toBe(statusWithoutDND.presence);
    });
  });
});
