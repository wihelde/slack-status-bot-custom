import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import { sanitizeDiagnosticText } from '../../../main/diagnostics';
import type { HostTelemetry } from '../../../main/telemetry';
import type { SourceName } from '../../../config/sourceCatalog';
import type { SourceStatus } from '../sourceAdapter';
import type { CommandRunner } from './commandProbe';

const observation = new AsyncLocalStorage<{
  telemetry?: HostTelemetry; source: SourceName; operation_id?: string; epoch: number | null;
  runner?: CommandRunner; succeeded: Set<string>; failed: boolean;
}>();

/** Keep command diagnostics with the source observation, including across concurrent probes. */
export function observeSource(telemetry: HostTelemetry | undefined, source: SourceName,
  runner: CommandRunner | undefined, operation_id: string | undefined, work: () => Promise<SourceStatus>, enabled = true): Promise<SourceStatus> {
  const started = Date.now();
  return observation.run({ telemetry, source, runner, operation_id, epoch: telemetry?.getCaptureEpoch() ?? null, succeeded: new Set(), failed: false }, async () => {
    let active = false;
    try {
      const status = await work();
      active = status.isActive;
      // An inactive/disabled source cannot establish recovery of a previously failed probe.
      if (status.isActive) for (const step of [...observation.getStore()!.succeeded, 'detector']) {
        const current = context(step);
        if (current) current.telemetry.recoverDiagnostic(current.diagnostic);
      }
      return status;
    } catch (error) {
      reportDetectorFailure(error);
      return { name: source, isActive: false };
    } finally {
      const current = observation.getStore()!;
      telemetry?.observeSourceCheck({ source, enabled, active, failed: current.failed, duration_ms: Math.max(0, Date.now() - started) }, current.epoch);
    }
  });
}

export function sourceCommandRunner() { return observation.getStore()?.runner; }

function context(step: string) {
  const current = observation.getStore();
  if (!current?.telemetry || current.epoch === null || current.epoch !== current.telemetry.getCaptureEpoch()) return;
  return { telemetry: current.telemetry, diagnostic: { component: 'source' as const,
    step: `${current.source}.${step}`, source: current.source, operation_id: current.operation_id } };
}

const commandFailure = z.object({ code: z.union([z.number(), z.string()]).optional(), signal: z.string().nullish(),
  killed: z.boolean().optional(), stderr: z.string().optional(), stack: z.string().optional() });

export function reportCommandFailure(error: unknown, step: string, noMatchExitCode?: number, duration_ms?: number): void {
  const parsed = commandFailure.safeParse(error);
  const fields = parsed.success ? parsed.data : {};
  // pgrep/lsof use exit 1 with no diagnostic to indicate an expected no-match.
  if (noMatchExitCode !== undefined && fields.code === noMatchExitCode && !fields.stderr?.trim() && !fields.signal && !fields.killed) return;
  if (/application isn['’]t running.*\(-600\)/i.test(fields.stderr ?? '')) return;
  const observationContext = observation.getStore();
  if (observationContext) observationContext.failed = true;
  const current = context(step);
  if (!current) return;
  // exec's message embeds the command/stdout. Keep stderr's first diagnostic line,
  // masking quoted values as well as credentials and paths before it leaves the probe.
  const original = fields.stderr?.trim().split(/\r?\n/, 1)[0];
  const diagnostic = original && sanitizeDiagnosticText(original.replace(
    /"(?:\\.|[^"\\])*"|(?<![\p{L}\p{N}])'(?:\\.|[^'\\])*'(?![\p{L}\p{N}])|[„“][^“”]*[“”]|«[^»]*»/gu,
    '[redacted]'));
  const nativeCode = original?.match(/\((-?\d{1,10})\)\s*$/)?.[1];
  current.telemetry.reportDiagnostic({ message: diagnostic || 'Source command failed', stack: fields.stack,
    code: typeof fields.code === 'string' ? fields.code : undefined }, {
    ...current.diagnostic, ...(nativeCode === undefined ? {} : { code: nativeCode }), failure_kind: 'command', duration_ms,
    exit_code: typeof fields.code === 'number' ? fields.code : undefined,
    signal: fields.signal ?? undefined, timeout: fields.killed === true || fields.code === 'ETIMEDOUT' || fields.code === 'ECONNABORTED',
  });
}

export function reportParseFailure(step: string): void {
  const observationContext = observation.getStore();
  if (observationContext) observationContext.failed = true;
  const current = context(step);
  current?.telemetry.reportDiagnostic(new Error('Invalid source probe response'), { ...current.diagnostic, failure_kind: 'parse' });
}

export function reportDetectorFailure(error: unknown): void {
  const observationContext = observation.getStore();
  if (observationContext) observationContext.failed = true;
  const current = context('detector');
  current?.telemetry.reportDiagnostic(error, { ...current.diagnostic, failure_kind: 'detector' });
}

export function recoverProbe(step: string): void {
  observation.getStore()?.succeeded.add(step);
}
