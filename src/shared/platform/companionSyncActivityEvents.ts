import type { NativeCompanionSyncEvent } from '../../../lib/platform/nativeCompanionSyncContract';

export type CompanionSyncRunResult = NonNullable<NativeCompanionSyncEvent['result']>;
export type CompanionSyncEventKind = NonNullable<NativeCompanionSyncEvent['kind']>;

export function createCompanionSyncRunId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `sync-run:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export function statusForSyncRunResult(result: CompanionSyncRunResult): NativeCompanionSyncEvent['status'] {
  if (result === 'completed') return 'completed';
  if (result === 'failed' || result === 'cancelled' || result === 'system_fault') return 'failed';
  return 'skipped';
}

export function inferSyncRunResult(event: NativeCompanionSyncEvent): CompanionSyncRunResult {
  if (event.result) return event.result;
  if (event.status === 'completed') return 'completed';
  if (event.status === 'failed') return 'failed';
  if (event.status === 'started') return 'partial';
  return 'partial';
}

export function isSyncRunFinishedEvent(event: NativeCompanionSyncEvent) {
  if (event.kind) return event.kind === 'run_finished';
  return event.status !== 'started';
}

export function isSyncEventConfirmedProgress(event: NativeCompanionSyncEvent) {
  const result = inferSyncRunResult(event);
  if (event.kind === 'run_started' || event.kind === 'diagnostic') return false;
  return result === 'completed' || result === 'partial';
}

export function compactSyncEvents(events: NativeCompanionSyncEvent[], maxRuns = 20) {
  const compacted: NativeCompanionSyncEvent[] = [];
  const keptRunIds = keptSyncRunIds(events, maxRuns);
  let legacyRunCount = 0;
  for (const event of events) {
    if (event.run_id) {
      if (keptRunIds.has(event.run_id)) compacted.push(event);
      continue;
    }
    if (isSyncRunFinishedEvent(event) && legacyRunCount < maxRuns) {
      legacyRunCount += 1;
      compacted.push(event);
    }
  }
  return compacted;
}

function keptSyncRunIds(events: NativeCompanionSyncEvent[], maxRuns: number) {
  const keptRunIds = new Set<string>();
  const finishedRunIds = new Set<string>();
  let runCount = 0;
  for (const event of events) {
    if (!event.run_id) continue;
    if (isSyncRunFinishedEvent(event)) {
      finishedRunIds.add(event.run_id);
      if (runCount >= maxRuns) continue;
      runCount += 1;
      keptRunIds.add(event.run_id);
    } else if (event.kind === 'run_started' && !finishedRunIds.has(event.run_id)) {
      keptRunIds.add(event.run_id);
    }
  }
  return keptRunIds;
}
