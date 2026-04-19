import { exec } from 'child_process';
import { promisify } from 'util';

export interface CommandProbeResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string) => Promise<CommandProbeResult>;

const execAsync = promisify(exec);

export const runCommand: CommandRunner = async (command: string) => {
  const { stdout = '', stderr = '' } = await execAsync(command);
  return { stdout, stderr };
};

export async function readCommandOutput(
  command: string,
  runner: CommandRunner = runCommand
): Promise<string | null> {
  try {
    const { stdout } = await runner(command);
    const trimmed = stdout.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

export async function commandHasOutput(
  command: string,
  runner: CommandRunner = runCommand
): Promise<boolean> {
  return (await readCommandOutput(command, runner)) !== null;
}
