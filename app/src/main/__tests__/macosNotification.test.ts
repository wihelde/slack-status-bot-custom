import { describe, expect, it, vi } from 'vitest';
import { showMacosNotification } from '../macosNotification';

describe('showMacosNotification', () => {
  it('passes notification content to osascript as arguments', () => {
    const body = 'Status set: :coffee: Kaffee "$(touch /tmp/nope)"';
    const execFile = vi.fn();

    showMacosNotification({ title: 'Slack Status Bot', body }, vi.fn(), execFile);

    expect(execFile).toHaveBeenCalledWith(
      '/usr/bin/osascript',
      [
        '-l',
        'JavaScript',
        '-e',
        expect.stringContaining("soundName: 'Glass'"),
        '--',
        'Slack Status Bot',
        body,
      ],
      expect.any(Function)
    );
  });
});
