export const TELEMETRY_ENVIRONMENTS = ['production', 'development', 'test'] as const;
export type TelemetryEnvironment = (typeof TELEMETRY_ENVIRONMENTS)[number];

export interface TelemetrySettings {
  enabled: boolean;
  diagnosticId: string;
  environment: TelemetryEnvironment | null;
}
