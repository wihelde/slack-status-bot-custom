import { CommandRunner, readCommandOutput, runCommand } from './commandProbe';
import { recoverProbe } from './probeContext';


export async function hasMacUdpConnectionMatch(
  processName: string,
  pattern: string,
  runner: CommandRunner = runCommand
): Promise<boolean> {
  const output = await readCommandOutput('lsof -i -P -n', runner, { step: 'network', noMatchExitCode: 1, recover: false });
  if (!output) return false;
  recoverProbe('network');
  return output.split('\n').some(line => line.includes(processName) && line.includes('UDP') && new RegExp(pattern).test(line));
}
