import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';

import type { CycleMeta } from './cycleFlowTypes.js';
import type { DailyFlowLearningSnapshot, DailyFlowSettings } from './dailyFlowContract.js';
import { flowPlan } from './dailyFlowPlanning.js';
import type { DailyFlowSession } from './dailyFlowSession.js';
import type { DailyFlowStore } from './dailyFlowStore.js';

const BATCH_SIZE = 32;

export function cycleReadyNodeIds(snapshot: DailyFlowLearningSnapshot, mode: ReviewSessionMode,
  now: string, settings: DailyFlowSettings) {
  const plan = flowPlan(snapshot, mode, now, settings);
  return mode === 'review-first' ? plan.fsrsQueueNodeIds : mode === 'reading-only'
    ? plan.readingQueueNodeIds : [...plan.fsrsQueueNodeIds, ...plan.readingQueueNodeIds];
}

async function scanRange(db: Pick<DailyFlowStore, 'scanRows' | 'scopedLearningSnapshot'>, meta: CycleMeta, args: { mode: ReviewSessionMode; now: string;
  settings: DailyFlowSettings; excluded?: string }) {
  while (meta.scanAfter < meta.lapLimit) {
    const rows = await db.scanRows(meta.scanAfter, meta.lapLimit, BATCH_SIZE);
    const ids = rows.map(row => row.node_id);
    const snapshot = ids.length ? await db.scopedLearningSnapshot(ids) : null;
    const ready = new Set(snapshot ? cycleReadyNodeIds({ ...snapshot, nodeOrder: ids }, args.mode, args.now, args.settings) : []);
    for (const row of rows) {
      crossClear(meta, row.order_key, args.now);
      meta.scanAfter = row.order_key;
      if (row.node_id !== args.excluded && ready.has(row.node_id)) return row;
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

export async function selectCycleSuccessor(db: Pick<DailyFlowStore, 'scanRows' | 'scopedLearningSnapshot'>, meta: CycleMeta,
  args: Parameters<typeof scanRange>[2]) {
  const currentLap = await scanRange(db, meta, args);
  if (currentLap) return currentLap;
  meta.scanAfter = 0;
  meta.lapLimit = meta.tailKey;
  return scanRange(db, meta, args);
}

// The persisted window describes the committed current item, never speculative work.
export function cycleWindow(session: DailyFlowSession) {
  return { ...session, queueNodeIds: session.currentNodeId ? [session.currentNodeId] : [],
    soonNodeIds: [], hiddenSoonNodeIds: [] };
}
