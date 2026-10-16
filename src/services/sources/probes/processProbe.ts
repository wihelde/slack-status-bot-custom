import { CommandRunner, commandHasOutput, runCommand } from './commandProbe';

function shellQuote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

export async function isMacProcessRunning(
  processName: string,
  runner: CommandRunner = runCommand
): Promise<boolean> {
  return commandHasOutput(`pgrep -x ${shellQuote(processName)}`, runner);
}

export async function isMacApplicationRunning(
  applicationName: string,
  runner: CommandRunner = runCommand
): Promise<boolean> {
  return commandHasOutput(`lsappinfo find name=${shellQuote(applicationName)}`, runner);
}

export async function isWindowsProcessRunning(
  executableName: string,
  runner: CommandRunner = runCommand
): Promise<boolean> {
  return commandHasOutput(`tasklist | findstr ${executableName} || exit /b 1`, runner);
}
