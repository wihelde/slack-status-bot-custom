import { z } from 'zod';

export const releaseVersion = z.string().regex(/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/).max(80);
export const uiInteraction = z.object({ action: z.enum(['support_opened', 'diagnostic_id_copied', 'logs_opened', 'reset_requested']) });
export const updateInteraction = z.object({ action: z.enum(['banner_shown', 'link_opened', 'dismissed', 'notification_requested', 'notification_shown', 'notification_failed', 'notification_unsupported']),
  entry_point: z.enum(['dashboard', 'tray', 'notification']), target_version: releaseVersion });
// Renderer input is deliberately narrow: no DOM contents, URLs, form values or arbitrary properties.
export const rendererObservation = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('setup'), outcome: z.enum(['accepted', 'rejected']), reason: z.enum(['valid_link', 'invalid_link', 'invalid_registration', 'generation_failed']) }),
  z.object({ kind: z.literal('ui'), ...uiInteraction.shape }),
  z.object({ kind: z.literal('update'), ...updateInteraction.pick({ action: true, target_version: true }).shape,
    action: z.enum(['banner_shown', 'link_opened', 'dismissed']) }),
  z.object({ kind: z.literal('error'), type: z.enum(['Error', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError', 'UnknownError']),
    step: z.enum(['window.error', 'promise.rejection', 'react.render']),
    message: z.string().max(1000), stack: z.string().max(6000).optional() }),
]);
export type RendererObservation = z.input<typeof rendererObservation>;

/** Keep recognizable JavaScript failures without forwarding arbitrary values interpolated into errors. */
export function rendererErrorMessage(message: string): string {
  const standard = message.match(/Cannot read properties of (?:undefined|null)(?: \(reading '[a-zA-Z_$][\w$]*'\))?|[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)* is not (?:a function|defined)|Cannot convert undefined or null to object|Maximum call stack size exceeded|Invalid array length|Minified React error #\d+/)?.[0];
  return standard ?? 'Renderer error; see stack location';
}

export const TELEMETRY_ENVIRONMENTS = ['production', 'development', 'test'] as const;
export type TelemetryEnvironment = (typeof TELEMETRY_ENVIRONMENTS)[number];

export interface TelemetrySettings {
  enabled: boolean;
  diagnosticId: string;
  environment: TelemetryEnvironment | null;
}
