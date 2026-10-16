import { describe, expect, it, vi } from 'vitest';
import { SlackService } from '../slack';
import { SlackStatusExecutor } from '../slackStatusExecutor';

describe('SlackStatusExecutor', () => {
  it('should apply profile, presence and DND in one execution path', async () => {
    const slackService = {
      setProfile: vi.fn().mockResolvedValue(true),
      setPresence: vi.fn().mockResolvedValue(true),
      enableDND: vi.fn().mockResolvedValue(true),
      disableDND: vi.fn().mockResolvedValue(true),
      getProfile: vi.fn(),
    } as unknown as SlackService;

    const executor = new SlackStatusExecutor(slackService);

    const success = await executor.applyStatusChange({
      emoji: ':focus:',
      text: 'Focus mode',
      presence: 'auto',
      dndAction: 'enable',
    });

    expect(success).toBe(true);
    expect(slackService.setProfile).toHaveBeenCalledWith(':focus:', 'Focus mode', 0);
    expect(slackService.setPresence).toHaveBeenCalledWith('auto');
    expect(slackService.enableDND).toHaveBeenCalled();
    expect(slackService.disableDND).not.toHaveBeenCalled();
  });

  it('still applies presence and DND when another workspace profile fails', async () => {
    const slackService = {
      setProfile: vi.fn().mockResolvedValue(false),
      setPresence: vi.fn().mockResolvedValue(true),
      enableDND: vi.fn().mockResolvedValue(true),
      disableDND: vi.fn().mockResolvedValue(true),
      getProfile: vi.fn(),
    } as unknown as SlackService;

    const executor = new SlackStatusExecutor(slackService);

    const success = await executor.applyStatusChange({
      emoji: ':focus:',
      text: 'Focus mode',
      presence: 'auto',
      dndAction: 'enable',
    });

    expect(success).toBe(false);
    expect(slackService.setPresence).toHaveBeenCalledWith('auto');
    expect(slackService.enableDND).toHaveBeenCalled();
  });

  it('should support source-only status updates', async () => {
    const slackService = {
      setProfile: vi.fn().mockResolvedValue(true),
      setPresence: vi.fn(),
      enableDND: vi.fn(),
      disableDND: vi.fn(),
      getProfile: vi.fn(),
    } as unknown as SlackService;

    const executor = new SlackStatusExecutor(slackService);

    const success = await executor.setSourceStatus(':spotify:', 'Playing music');

    expect(success).toBe(true);
    expect(slackService.setProfile).toHaveBeenCalledWith(':spotify:', 'Playing music');
  });
});
