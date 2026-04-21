import { CommandRunner, readCommandOutput, runCommand } from './commandProbe';

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildAppleScriptCommand(lines: string[]): string {
  return ['osascript', ...lines.map(line => `-e ${shellQuote(line)}`)].join(' ');
}

export async function readAppleScriptOutput(
  lines: string[],
  runner: CommandRunner = runCommand
): Promise<string | null> {
  return readCommandOutput(buildAppleScriptCommand(lines), runner);
}
