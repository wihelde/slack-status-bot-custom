import { exec } from 'child_process';
import { promisify } from 'util';
import { sourceCommandRunner, reportCommandFailure, recoverProbe } from './probeContext';

export interface CommandProbeResult {
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string) => Promise<CommandProbeResult>;

const execAsync = promisify(exec);

export const runCommand: CommandRunner = async (command: string) => {
  const { stdout = '', stderr = '' } = await (sourceCommandRunner()?.(command) ?? execAsync(command));
  return { stdout, stderr };
};

export async function readCommandOutput(
  command: string,
  runner: CommandRunner = runCommand,
  options: { step?: string; noMatchExitCode?: number; recover?: boolean } = {}
): Promise<string | null> {
  const started = Date.now();
  try {
    const { stdout } = await runner(command);
    const trimmed = stdout.trim();
    if (trimmed && options.recover !== false) recoverProbe(options.step ?? 'command');
    return trimmed ? trimmed : null;
  } catch (error) {
    reportCommandFailure(error, options.step ?? 'command', options.noMatchExitCode, Math.max(0, Date.now() - started));
    return null;
  }
}

export async function commandHasOutput(
  command: string,
  runner: CommandRunner = runCommand,
  options: { step?: string; noMatchExitCode?: number; recover?: boolean } = {}
): Promise<boolean> {
  return (await readCommandOutput(command, runner, options)) !== null;
}
