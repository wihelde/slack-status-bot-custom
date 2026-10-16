import { execFile } from 'child_process';
import type { ExternalStatusCommandNotification } from './externalStatusCommand';

const script = `
function run(argv) {
  const application = Application.currentApplication();
  application.includeStandardAdditions = true;
  application.displayNotification(argv[1], { withTitle: argv[0], soundName: 'Glass' });
}
`;

type ExecFile = (
  file: string,
  args: string[],
  callback: (error: Error | null) => void
) => void;

export function showMacosNotification(
  notification: ExternalStatusCommandNotification,
  log: (message: string) => void,
  execFileFn: ExecFile = execFile
): void {
  execFileFn(
    '/usr/bin/osascript',
    ['-l', 'JavaScript', '-e', script, '--', notification.title, notification.body],
    error => {
      if (error) {
        log(`[Notification] osascript failed: ${error.message}`);
      }
    }
  );
}
