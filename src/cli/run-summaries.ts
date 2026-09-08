import { PERSONAS, type PersonaIntent } from '../agent/personas.js';
import type { NetworkEntry, RuntimeErrorEntry } from '../evidence/recorder.js';
import type { ReportFlow, ReportRuntimeError, ReportSafety, ReportStopReason } from '../report/contract.js';
import { isInfrastructureUrl } from '../url.js';
import type { ReplayResult } from '../verify/replay.js';
import type { SafetyEvent } from './run-types.js';
import type { ExplorationRun } from './orchestrate.js';

export function emptySafety(): ReportSafety {
  return {
    blockedRequests: 0,
    explorationBlocked: 0,
    replayBlocked: 0,
    byMethod: {},
    samples: [],
    safetyRelatedRuntimeErrors: 0,
  };
}

export function runOutcome(run: ExplorationRun): {
  personaIntent: PersonaIntent | undefined;
  exhausted: boolean;
  stopReason: ReportStopReason;
} {
  return {
    personaIntent: run.args.personaName ? PERSONAS[run.args.personaName]?.intent : undefined,
    exhausted: run.discovery?.exhausted ?? false,
    stopReason: run.discovery?.stopReason ?? (run.error ? 'error' : 'completed'),
  };
}

export function summarizeSafety(rawEvents: SafetyEvent[]): ReportSafety {
  // A same-origin infrastructure beacon (see `isInfrastructureUrl`) isn't part of the target
  // application — blocking it is real, but surfacing it as "blocked application traffic" would
  // inflate the count and samples with noise no application decision ever produced.
  const events = rawEvents.filter((event) => !isInfrastructureUrl(event.url));
  const byMethod: Record<string, number> = {};
  for (const event of events) byMethod[event.method] = (byMethod[event.method] ?? 0) + 1;
  const samples: ReportSafety['samples'] = [];
  const seen = new Set<string>();
  for (const event of events) {
    const key = `${event.phase}:${event.method}:${event.url}`;
    if (seen.has(key) || samples.length >= 20) continue;
    seen.add(key);
    samples.push(event);
  }
  return {
    blockedRequests: events.length,
    explorationBlocked: events.filter((event) => event.phase === 'exploration').length,
    replayBlocked: events.filter((event) => event.phase === 'replay').length,
    byMethod,
    samples,
    safetyRelatedRuntimeErrors: 0,
  };
}

export function summarizeRuntimeErrors(
  entries: Array<{ error: RuntimeErrorEntry; phase: 'exploration' | 'replay'; flowIndex?: number }>,
): ReportRuntimeError[] {
  const grouped = new Map<string, ReportRuntimeError>();
  for (const entry of entries) {
    const { error, phase, flowIndex } = entry;
    const key = JSON.stringify([
      phase,
      flowIndex,
      error.kind,
      error.message,
      error.method,
      error.url,
      error.status,
      error.safetyRelated,
      error.lifecycle,
    ]);
    const existing = grouped.get(key);
    if (existing) {
      existing.occurrences += 1;
      continue;
    }
    grouped.set(key, { ...error, phase, flowIndex, occurrences: 1 });
  }
  return [...grouped.values()];
}

export function classifyReplayFailure(
  result: ReplayResult,
  runtimeErrors: RuntimeErrorEntry[],
): NonNullable<ReportFlow['replayFailure']>['cause'] {
  const authenticationSnapshot = /(?:sign\s*in|log\s*in|username|password)/i.test(result.finalSnapshot);
  const unauthorizedResponse = runtimeErrors.some(
    (error) => error.status === 401 || error.status === 403 || /status(?: of)? (?:401|403)/i.test(error.message),
  );
  if (/\/login(?:[/?#]|$)/i.test(result.finalUrl) || authenticationSnapshot || unauthorizedResponse)
    return 'authentication';
  if (/loading|skeleton|spinner/i.test(result.finalSnapshot)) return 'loading';
  if (
    runtimeErrors.some((error) => !error.lifecycle && (error.kind === 'http_error' || error.kind === 'request_failed'))
  )
    return 'request';
  if (result.safetyBlocked > 0) return 'safety';
  if (result.failedAt) return 'action';
  if (!result.expectationsReproduced) return 'expectation';
  return 'verification';
}

/**
 * A challenge-mode "confirmed" finding must be backed by some positive evidence — an explicit
 * expectation check, a failed (4xx/5xx) request, or a recorded runtime error — not just silence.
 * Without this, a flow that never observed anything at all (e.g. two bare navigates with no
 * `waitFor`/`verifyExpectation`) trivially "passes" on every replay, since replaying the same
 * non-observation reproduces the same non-observation. See FINDINGS-round2.md point 6.
 */
export function hasMinimumChallengeEvidence(
  expectedExpectationsCount: number,
  network: NetworkEntry[],
  runtimeErrors: RuntimeErrorEntry[],
): boolean {
  return (
    expectedExpectationsCount > 0 ||
    network.some((entry) => entry.status !== undefined && entry.status >= 400) ||
    runtimeErrors.length > 0
  );
}
