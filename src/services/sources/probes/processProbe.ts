import { CommandRunner, commandHasOutput, readCommandOutput, runCommand } from './commandProbe';

function shellQuote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

export async function isMacProcessRunning(
  processName: string,
  runner: CommandRunner = runCommand
): Promise<boolean> {
  return commandHasOutput(`pgrep -x ${shellQuote(processName)}`, runner, { step: 'process', noMatchExitCode: 1 });
}

export async function isMacApplicationRunning(
  applicationName: string,
  runner: CommandRunner = runCommand
): Promise<boolean> {
  return commandHasOutput(`lsappinfo find name=${shellQuote(applicationName)}`, runner, { step: 'application' });
}

export async function isWindowsProcessRunning(
  executableName: string,
  runner: CommandRunner = runCommand
): Promise<boolean> {
  const output = await readCommandOutput('tasklist', runner, { step: 'process' });
  return output?.includes(executableName) ?? false;
}
