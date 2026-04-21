import { describe, expect, it, vi } from 'vitest';
import { MeetingDetector } from '../detectors/meetingDetector';

describe('MeetingDetector', () => {
  it('returns inactive when the detector is unavailable', async () => {
    const probe = vi.fn();
    const detector = new MeetingDetector({
      name: 'Zoom',
      emoji: ':zoom_3:',
      activeMessage: 'In a meeting - will answer later',
      isAvailable: () => false,
      probe,
    });

    await expect(detector.getStatus()).resolves.toEqual({
      name: 'Zoom',
      isActive: false,
      emoji: ':zoom_3:',
      message: undefined,
    });
    expect(probe).not.toHaveBeenCalled();
  });

  it('returns inactive when the probe does not find a meeting', async () => {
    const probe = vi.fn().mockResolvedValue(false);
    const detector = new MeetingDetector({
      name: 'Zoom',
      emoji: ':zoom_3:',
      activeMessage: 'In a meeting - will answer later',
      probe,
    });

    await expect(detector.getStatus()).resolves.toEqual({
      name: 'Zoom',
      isActive: false,
      emoji: ':zoom_3:',
      message: undefined,
    });
    expect(probe).toHaveBeenCalledOnce();
  });

  it('returns active status when the meeting probe succeeds', async () => {
    const detector = new MeetingDetector({
      name: 'Zoom',
      emoji: ':zoom_3:',
      activeMessage: 'In a meeting - will answer later',
      probe: vi.fn().mockResolvedValue(true),
    });

    await expect(detector.getStatus()).resolves.toEqual({
      name: 'Zoom',
      isActive: true,
      emoji: ':zoom_3:',
      message: 'In a meeting - will answer later',
    });
  });

  it('supports family members with different active copy', async () => {
    const detector = new MeetingDetector({
      name: 'Slack Huddle',
      emoji: ':headphones:',
      activeMessage: 'In a huddle - will answer later',
      probe: vi.fn().mockResolvedValue(true),
    });

    await expect(detector.getStatus()).resolves.toEqual({
      name: 'Slack Huddle',
      isActive: true,
      emoji: ':headphones:',
      message: 'In a huddle - will answer later',
    });
  });

  it('falls back to inactive when the probe throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const detector = new MeetingDetector({
      name: 'Zoom',
      emoji: ':zoom_3:',
      activeMessage: 'In a meeting - will answer later',
      probe: vi.fn().mockRejectedValue(new Error('boom')),
    });

    await expect(detector.getStatus()).resolves.toEqual({
      name: 'Zoom',
      isActive: false,
      emoji: ':zoom_3:',
      message: undefined,
    });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('keeps inactive output normalized across meeting family members', async () => {
    const detector = new MeetingDetector({
      name: 'Microsoft Teams',
      emoji: ':teams:',
      activeMessage: 'In a meeting - will answer later',
      probe: vi.fn().mockResolvedValue(false),
    });

    await expect(detector.getStatus()).resolves.toEqual({
      name: 'Microsoft Teams',
      isActive: false,
      emoji: ':teams:',
      message: undefined,
    });
  });
});
