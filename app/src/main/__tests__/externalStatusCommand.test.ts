import { describe, expect, it, vi } from 'vitest';
import {
  createExternalStatusCommandHandler,
  parseExternalStatusCommand,
} from '../externalStatusCommand';

describe('externalStatusCommand', () => {
  const createDaemon = () => ({
    setExternalStatus: vi.fn().mockResolvedValue(true),
    goOnline: vi.fn().mockResolvedValue(true),
    goAway: vi.fn().mockResolvedValue(true),
  });

  it('parses URL-encoded set commands', () => {
    expect(
      parseExternalStatusCommand(
        'slack-status-bot://set?emoji=:shopping_trolley:&text=Bin%20einkaufen'
      )
    ).toEqual({
      type: 'set',
      emoji: ':shopping_trolley:',
      text: 'Bin einkaufen',
      presence: 'auto',
    });
  });

  it('parses explicit away presence', () => {
    expect(
      parseExternalStatusCommand(
        'slack-status-bot://set?emoji=:shopping_trolley:&text=Bin%20einkaufen&presence=away'
      )
    ).toEqual({
      type: 'set',
      emoji: ':shopping_trolley:',
      text: 'Bin einkaufen',
      presence: 'away',
    });
  });

  it('parses online and offline quick-action commands', () => {
    expect(parseExternalStatusCommand('slack-status-bot://online')).toEqual({
      type: 'online',
    });
    expect(parseExternalStatusCommand('slack-status-bot://offline')).toEqual({
      type: 'offline',
    });
  });

  it('rejects unsupported or incomplete URLs', () => {
    expect(parseExternalStatusCommand('https://example.com/set?emoji=:x:&text=nope')).toBeNull();
    expect(parseExternalStatusCommand('slack-status-bot://holiday?emoji=:palm_tree:&text=Urlaub')).toBeNull();
    expect(parseExternalStatusCommand('slack-status-bot://set?emoji=:shopping_trolley:')).toBeNull();
    expect(parseExternalStatusCommand('slack-status-bot://set?emoji=:x:&text=nope&presence=busy')).toBeNull();
    expect(parseExternalStatusCommand('not a url')).toBeNull();
  });

  it('dispatches valid commands through the daemon', async () => {
    const daemon = createDaemon();
    const notify = vi.fn();
    const handler = createExternalStatusCommandHandler({
      getDaemon: () => daemon,
      log: vi.fn(),
      notify,
    });

    expect(handler.handleUrl('slack-status-bot://set?emoji=:coffee:&text=Kaffee')).toBe(true);
    await vi.waitFor(() => expect(daemon.setExternalStatus).toHaveBeenCalledWith(':coffee:', 'Kaffee', 'auto'));
    expect(notify).toHaveBeenCalledWith({
      title: 'Slack Status Bot',
      body: 'Status set: :coffee: Kaffee',
    });
  });

  it('dispatches online and offline commands through the quick actions', async () => {
    const daemon = createDaemon();
    const notify = vi.fn();
    const handler = createExternalStatusCommandHandler({
      getDaemon: () => daemon,
      log: vi.fn(),
      notify,
    });

    expect(handler.handleUrl('slack-status-bot://online')).toBe(true);
    await vi.waitFor(() => expect(daemon.goOnline).toHaveBeenCalled());
    expect(notify).toHaveBeenCalledWith({
      title: 'Slack Status Bot',
      body: 'Status set: Online',
    });

    expect(handler.handleUrl('slack-status-bot://offline')).toBe(true);
    await vi.waitFor(() => expect(daemon.goAway).toHaveBeenCalled());
    expect(notify).toHaveBeenCalledWith({
      title: 'Slack Status Bot',
      body: 'Status set: Offline',
    });
  });

  it('queues valid commands until the daemon is ready', async () => {
    const daemon = createDaemon();
    let currentDaemon: ReturnType<typeof createDaemon> | null = null;
    const notify = vi.fn();
    const handler = createExternalStatusCommandHandler({
      getDaemon: () => currentDaemon,
      log: vi.fn(),
      notify,
    });

    expect(handler.handleUrl('slack-status-bot://set?emoji=:coffee:&text=Kaffee')).toBe(true);
    expect(daemon.setExternalStatus).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();

    currentDaemon = daemon;
    await handler.flushPending();

    expect(daemon.setExternalStatus).toHaveBeenCalledWith(':coffee:', 'Kaffee', 'auto');
    expect(notify).toHaveBeenCalledWith({
      title: 'Slack Status Bot',
      body: 'Status set: :coffee: Kaffee',
    });
  });

  it('notifies when a command fails', async () => {
    const daemon = createDaemon();
    daemon.setExternalStatus.mockResolvedValue(false);
    const notify = vi.fn();
    const handler = createExternalStatusCommandHandler({
      getDaemon: () => daemon,
      log: vi.fn(),
      notify,
    });

    expect(handler.handleUrl('slack-status-bot://set?emoji=:coffee:&text=Kaffee')).toBe(true);
    await vi.waitFor(() => expect(notify).toHaveBeenCalledWith({
      title: 'Slack Status Bot',
      body: 'Status could not be set',
    }));
  });
});
