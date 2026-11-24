import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';

import { cycleScanFilter, deriveCycleReadiness } from './cycleFlowReadiness.js';
import { toCycleRow, type CycleMeta, type CycleRow, type CycleStoredRow } from './cycleFlowTypes.js';
import type { DailyFlowLearningSnapshot, DailyFlowSettings } from './dailyFlowContract.js';
import { flowPlan } from './dailyFlowPlanning.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import type { DailyFlowStore } from './dailyFlowStore.js';

const BATCH_SIZE = 32;
const TIMED_BATCH_SIZE = 8;

type ScanStore = Pick<DailyFlowStore, 'scanRows' | 'timedRows' | 'scopedLearningSnapshot'>;
type ScanArgs = { mode: ReviewSessionMode; now: string; settings: DailyFlowSettings;
  matches?: (row: CycleRow, snapshot: DailyFlowLearningSnapshot) => boolean; excluded?: string | readonly string[];
  onSkipped?: (row: CycleRow, snapshot: DailyFlowLearningSnapshot) => void;
  /** Visit rows that are hidden or still waiting too, for callers that must observe them as skipped. */
  allRows?: boolean;
  /** Receives rows whose stored readiness was missing or stale so a writer can save the derived values. */
  onReadiness?: (rows: CycleStoredRow[]) => void };

export function cycleReadyNodeIds(snapshot: DailyFlowLearningSnapshot, mode: ReviewSessionMode,
  now: string, settings: DailyFlowSettings) {
  const plan = flowPlan(snapshot, mode, now, settings);
  return mode === 'review-first' ? plan.fsrsQueueNodeIds : mode === 'reading-only'
    ? plan.readingQueueNodeIds : [...plan.fsrsQueueNodeIds, ...plan.readingQueueNodeIds];
}

async function judge(db: ScanStore, rows: CycleStoredRow[], args: ScanArgs) {
  const ids = rows.map(row => row.node_id);
  const snapshot = ids.length ? await db.scopedLearningSnapshot(ids) : null;
  const ready = new Set(snapshot ? cycleReadyNodeIds({ ...snapshot, nodeOrder: ids }, args.mode, args.now, args.settings) : []);
  if (snapshot && args.onReadiness) {
    const derived = deriveCycleReadiness(snapshot, ids, args.now, args.settings);
    const stale = rows.filter(row => {
      const value = derived.get(row.node_id);
      return value && (row.kind !== value.kind || (row.ready_at_ms ?? null) !== value.ready_at_ms);
    });
    if (stale.length) args.onReadiness(stale.map(row => ({ ...toCycleRow(row), ...derived.get(row.node_id)! })));
  }
  return { snapshot, ready };
}

function isExcluded(args: ScanArgs, id: string) {
  return typeof args.excluded === 'string' ? id === args.excluded : Boolean(args.excluded?.includes(id));
}

export async function scanCycleRange(db: ScanStore, meta: CycleMeta, args: ScanArgs) {
  const filter = args.allRows ? undefined : cycleScanFilter(args.mode, args.now);
  while (meta.scanAfter < meta.lapLimit) {
    const rows = await db.scanRows(meta.scanAfter, meta.lapLimit, BATCH_SIZE, filter);
    const { snapshot, ready } = await judge(db, rows, args);
    for (const stored of rows) {
      const row = toCycleRow(stored);
      crossClear(meta, row.order_key, args.now);
      meta.scanAfter = row.order_key;
      if (!isExcluded(args, row.node_id) && ready.has(row.node_id) && (!args.matches || args.matches(row, snapshot!))) return row;
      if (!ready.has(row.node_id)) args.onSkipped?.(row, snapshot!);
    }
    if (!rows.length || rows.length < BATCH_SIZE) {
      crossClear(meta, meta.lapLimit + 1, args.now);
      meta.scanAfter = meta.lapLimit;
    }
  }
  crossClear(meta, meta.lapLimit + 1, args.now);
  return null;
}

function crossClear(meta: CycleMeta, position: number, now: string) {
  if (!meta.clearedAt && position > meta.clearKey) meta.clearedAt = now;
}

// A waiting row whose time has come is taken before the ordered queue; the ready cursor resumes afterwards.
async function takeTimedRow(db: ScanStore, meta: CycleMeta, args: ScanArgs) {
  if (!db.timedRows) return null;
  const rows = (await db.timedRows(cycleScanFilter(args.mode, args.now), TIMED_BATCH_SIZE))
    .filter(row => !isExcluded(args, row.node_id));
  const { snapshot, ready } = await judge(db, rows, args);
  const found = rows.find(row => ready.has(row.node_id) && (!args.matches || args.matches(toCycleRow(row), snapshot!)));
  if (!found) return null;
  meta.timedResume = { key: found.order_key, after: meta.scanAfter };
  meta.scanAfter = found.order_key;
  return toCycleRow(found);
}

export async function selectCycleSuccessor(db: ScanStore, meta: CycleMeta, args: ScanArgs) {
  if (meta.timedResume && meta.timedResume.key === meta.scanAfter) meta.scanAfter = meta.timedResume.after;
  delete meta.timedResume;
  const timed = await takeTimedRow(db, meta, args);
  if (timed) {
    // Every ordered row after the cursor lies beyond the queue end, so serving a due card must not delay the clear mark.
    crossClear(meta, meta.timedResume!.after + 1, args.now);
    return timed;
  }
  const currentLap = await scanCycleRange(db, meta, args);
  if (currentLap) return currentLap;
  meta.scanAfter = 0;
  meta.lapLimit = meta.tailKey;
  return scanCycleRange(db, meta, args);
}

// The persisted window describes the committed current item, never speculative work.
export function cycleWindow(session: DailyFlowSession) {
  return { ...session, queueNodeIds: session.currentNodeId ? [session.currentNodeId] : [],
    soonNodeIds: [], hiddenSoonNodeIds: [] };
}
