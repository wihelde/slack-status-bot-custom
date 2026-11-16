import { IPCService } from './services/ipcService';
import { rendererErrorMessage, type RendererObservation } from './contracts/telemetry';

/** Observe UI errors locally; the host performs final redaction, grouping and opt-out checks. */
export function reportRendererError(error: unknown, step: Extract<RendererObservation, { kind: 'error' }>['step']) {
  const failure = error instanceof Error ? error : null;
  const type = failure?.name;
  void IPCService.observe({ kind: 'error', step,
    type: type === 'Error' || type === 'TypeError' || type === 'RangeError' || type === 'ReferenceError' || type === 'SyntaxError' ? type : 'UnknownError',
    message: rendererErrorMessage(failure?.message ?? ''), stack: failure?.stack?.slice(0, 6000),
  });
}

window.addEventListener('error', event => reportRendererError(event.error, 'window.error'));
window.addEventListener('unhandledrejection', event => reportRendererError(event.reason, 'promise.rejection'));
