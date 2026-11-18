import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { telemetryEvents, TelemetryEvent } from './telemetryEvents';
import type { SourceName } from '../config/sourceCatalog';

type Capture = <E extends TelemetryEvent>(event: E, properties: z.input<(typeof telemetryEvents)[E]>) => void;
export type SourceCheck = { source: SourceName; enabled: boolean; active: boolean; failed: boolean; duration_ms: number };
export type SourceDecision = { active: SourceName[]; winner?: SourceName; protected?: boolean };
export type ResourceSample = { cpu_percent: number; memory_mb: number };

/** Bounded local counters; emit at most six source summaries and one resource summary per hour. */
export function createTelemetryMetrics(capture: Capture) {
  let windowId = randomUUID();
  let windowStarted = Date.now();
  const sources = new Map<SourceName, { checks: number; active_checks: number; failed_checks: number;
    duration_total_ms: number; duration_max_ms: number; decisions: number; selected_checks: number;
    priority_blocked_checks: number; protected_checks: number; protection_unknown_checks: number; transitions: number }>();
  const previousActive = new Map<SourceName, boolean>();
  const transitions = new Map<SourceName, number[]>();
  const lastFlapping = new Map<SourceName, number>();
  const lastUse = new Map<SourceName, { at: number; id: string }>();
  let lastAutomatic: { at: number; id: string; source?: SourceName } | undefined;
  let resources = { samples: 0, cpu_percent_total: 0, cpu_percent_max: 0, memory_mb_total: 0, memory_mb_max: 0 };

  function sourceCounters(source: SourceName) {
    let counters = sources.get(source);
    if (!counters) {
      counters = { checks: 0, active_checks: 0, failed_checks: 0, duration_total_ms: 0, duration_max_ms: 0,
        decisions: 0, selected_checks: 0, priority_blocked_checks: 0, protected_checks: 0, protection_unknown_checks: 0, transitions: 0 };
      sources.set(source, counters);
    }
    return counters;
  }

  function sourceCheck(check: SourceCheck) {
    if (!check.enabled) return;
    const counters = sourceCounters(check.source);
    counters.checks++;
    counters.active_checks += Number(check.active);
    counters.failed_checks += Number(check.failed);
    counters.duration_total_ms += check.duration_ms;
    counters.duration_max_ms = Math.max(counters.duration_max_ms, check.duration_ms);
    if (previousActive.has(check.source) && previousActive.get(check.source) !== check.active) {
      counters.transitions++;
      const now = Date.now();
      const recent = [...(transitions.get(check.source) ?? []).filter(at => now - at <= 300_000), now].slice(-6);
      transitions.set(check.source, recent);
      if (recent.length === 6 && now - (lastFlapping.get(check.source) ?? -Infinity) >= 300_000) {
        capture('automation_quality', { kind: 'source_flapping', source: check.source, transitions: 6 });
        lastFlapping.set(check.source, now);
      }
    }
    previousActive.set(check.source, check.active);
  }

  function sourceDecision(decision: SourceDecision) {
    for (const source of decision.active) {
      const counters = sourceCounters(source);
      counters.decisions++;
      counters.selected_checks += Number(source === decision.winner);
      counters.priority_blocked_checks += Number(source !== decision.winner);
      counters.protected_checks += Number(source === decision.winner && decision.protected === true);
      counters.protection_unknown_checks += Number(source === decision.winner && decision.protected === undefined);
    }
  }

  function operation(properties: z.input<typeof telemetryEvents.status_operation>) {
    if (!['success', 'partial'].includes(properties.outcome)) return;
    const now = Date.now();
    if (properties.trigger === 'automatic') {
      lastAutomatic = { at: now, id: properties.operation_id, source: properties.source };
      if (properties.source) lastUse.set(properties.source, { at: now, id: properties.operation_id });
    } else if (properties.trigger === 'manual' && lastAutomatic && now - lastAutomatic.at <= 120_000) {
      capture('automation_quality', { kind: 'manual_followed_automation', source: lastAutomatic.source,
        previous_operation_id: lastAutomatic.id, operation_id: properties.operation_id, elapsed_ms: now - lastAutomatic.at });
      lastAutomatic = undefined;
    }
  }

  function setting(properties: z.input<typeof telemetryEvents.settings_changed>) {
    if (properties.setting !== 'source' || !properties.source) return;
    // Disabled intervals are not evidence of detector flapping.
    previousActive.delete(properties.source);
    transitions.delete(properties.source);
    if (properties.enabled !== false) return;
    const recent = lastUse.get(properties.source);
    if (recent && Date.now() - recent.at <= 300_000) capture('automation_quality', {
      kind: 'source_disabled_after_use', source: properties.source, previous_operation_id: recent.id, elapsed_ms: Date.now() - recent.at,
    });
    lastUse.delete(properties.source);
  }

  function sample(value: ResourceSample) {
    if (![value.cpu_percent, value.memory_mb].every(number => Number.isFinite(number) && number >= 0)) return;
    resources.samples++;
    resources.cpu_percent_total += value.cpu_percent;
    resources.cpu_percent_max = Math.max(resources.cpu_percent_max, value.cpu_percent);
    resources.memory_mb_total += value.memory_mb;
    resources.memory_mb_max = Math.max(resources.memory_mb_max, value.memory_mb);
  }

  function flush() {
    const window = { window_id: windowId, window_started: new Date(windowStarted).toISOString(), window_ended: new Date().toISOString() };
    for (const [source, counters] of sources) capture('source_health_summary', { source, ...window, ...counters });
    if (resources.samples) capture('performance_summary', { ...window, ...resources });
    sources.clear();
    resources = { samples: 0, cpu_percent_total: 0, cpu_percent_max: 0, memory_mb_total: 0, memory_mb_max: 0 };
    windowId = randomUUID();
    windowStarted = Date.now();
  }

  function reset() {
    sources.clear(); previousActive.clear(); transitions.clear(); lastFlapping.clear(); lastUse.clear();
    lastAutomatic = undefined;
    resources = { samples: 0, cpu_percent_total: 0, cpu_percent_max: 0, memory_mb_total: 0, memory_mb_max: 0 };
    windowId = randomUUID(); windowStarted = Date.now();
  }
  return { sourceCheck, sourceDecision, operation, setting, sample, flush, reset };
}
