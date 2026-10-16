import { CommandRunner, commandHasOutput, runCommand } from './commandProbe';

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function hasMacUdpConnectionMatch(
  processName: string,
  pattern: string,
  runner: CommandRunner = runCommand
): Promise<boolean> {
  const command = `${[
    'lsof -i -P -n 2>&1',
    `grep ${shellQuote(processName)}`,
    'grep UDP',
    `grep -E ${shellQuote(pattern)}`,
  ].join(' | ')} || true`;

  return commandHasOutput(command, runner);
}
