import { createReviewQueueTimeInput } from '../review/queue/reviewQueueTimeInput.js';
import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';
import { isReadingReviewItemNode } from '../review/reviewItemKind.js';

import type { CycleKind, CycleReadiness, CycleRow, CycleStoredRow } from './cycleFlowTypes.js';
import type { DailyFlowLearningSnapshot, DailyFlowSettings } from './dailyFlowContract.js';
import { isFlowWindowUnexpired } from './dailyFlowDayWindow.js';
import { flowPlan } from './dailyFlowPlanning.js';
import type { CycleScanFilter } from './dailyFlowStore.js';

export function cycleModeKinds(mode: ReviewSessionMode): CycleKind[] {
  return mode === 'review-first' ? ['review'] : mode === 'reading-only' ? ['reading'] : ['review', 'reading'];
}

export function cycleScanFilter(mode: ReviewSessionMode, now: string): CycleScanFilter {
  return { kinds: cycleModeKinds(mode), nowMs: Date.parse(now) };
}

/**
 * Derive each node's queue kind and, when it is not doable yet, the time it becomes doable.
 * Rows doable now, and rows that are unavailable rather than early, stay in the ordered ready queue.
 */
export function deriveCycleReadiness(snapshot: DailyFlowLearningSnapshot, ids: readonly string[], now: string,
  settings: DailyFlowSettings): Map<string, CycleReadiness> {
  const present = ids.filter(id => snapshot.nodesById[id]);
  const plan = flowPlan({ ...snapshot, nodeOrder: present }, 'recommended', now, settings);
  const ready = new Set([...plan.fsrsQueueNodeIds, ...plan.readingQueueNodeIds]);
  const window = settings.dayWindow && isFlowWindowUnexpired(settings.dayWindow, now) ? settings.dayWindow : undefined;
  const time = createReviewQueueTimeInput(settings.newDayStartsAtHour, settings.newDayStartsAtHour, window);
  const nowMs = Date.parse(now);
  return new Map(present.map(id => {
    const node = snapshot.nodesById[id]!;
    const kind: CycleKind = isReadingReviewItemNode(node) ? 'reading' : 'review';
    if (ready.has(id)) return [id, { kind, ready_at_ms: null }];
    const at = kind === 'reading' ? time.timestamp(time.readingAvailableAt(node)) : time.reviewDueAt(node, now);
    return [id, { kind, ready_at_ms: Number.isFinite(at) && at > nowMs ? at : null }];
  }));
}

/**
 * Whether stored readiness must be rewritten. A time that has arrived on a doable entry stays, so the entry
 * keeps its place ahead of the ordered queue until it is served.
 */
export function isCycleReadinessStale(stored: Partial<CycleReadiness> | undefined, derived: CycleReadiness,
  doable: boolean, now: string) {
  if (stored?.kind !== derived.kind) return true;
  const at = stored.ready_at_ms ?? null;
  if (doable && derived.ready_at_ms === null && at !== null && at <= Date.parse(now)) return false;
  return at !== derived.ready_at_ms;
}

export function withCycleReadiness(rows: readonly CycleRow[], readiness: ReadonlyMap<string, CycleReadiness>): CycleStoredRow[] {
  return rows.map(row => ({ ...row, ...(readiness.get(row.node_id) ?? {}) }));
}
