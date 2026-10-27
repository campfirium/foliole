import type { ReviewSessionMode } from '../review/queue/reviewQueueTypes.js';
import type { DbPort } from '../sync/dbPort.js';

import type { CycleMeta, CycleRow } from './cycleFlowTypes.js';
import type { DailyFlowSettings } from './dailyFlowContract.js';
import { scopedDailySnapshot } from './dailyFlowGrade.js';
import { flowPlan } from './dailyFlowPlanning.js';
import type { DailyFlowPersistence } from './dailyFlowService.js';
import type { DailyFlowSession } from './dailyFlowSession.js';

const BATCH_SIZE = 32;

async function scanRange(db: DbPort, meta: CycleMeta, args: { mode: ReviewSessionMode; now: string;
  settings: DailyFlowSettings; persistence: DailyFlowPersistence; excluded?: string }) {
  while (meta.scanAfter < meta.lapLimit) {
    const rows = await db.query<CycleRow>(`SELECT * FROM daily_flow_entries WHERE active=1
      AND order_key > ? AND order_key <= ? ORDER BY order_key LIMIT ?`, [meta.scanAfter, meta.lapLimit, BATCH_SIZE]);
    const ids = rows.map(row => row.node_id);
    const snapshot = ids.length ? await scopedDailySnapshot(db, args.persistence, ids) : null;
    const plan = snapshot ? flowPlan({ ...snapshot, nodeOrder: ids }, args.mode, args.now, args.settings) : null;
    const ready = new Set(args.mode === 'review-first' ? plan?.fsrsQueueNodeIds : args.mode === 'reading-only'
      ? plan?.readingQueueNodeIds : [...(plan?.fsrsQueueNodeIds ?? []), ...(plan?.readingQueueNodeIds ?? [])]);
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

export async function selectCycleSuccessor(db: DbPort, meta: CycleMeta,
  args: Parameters<typeof scanRange>[2]) {
  const currentLap = await scanRange(db, meta, args);
  if (currentLap) return currentLap;
  meta.scanAfter = 0;
  meta.lapLimit = meta.tailKey;
  return scanRange(db, meta, args);
}

export async function cycleWindow(db: DbPort, session: DailyFlowSession,
  args: Parameters<typeof scanRange>[2]) {
  const current = session.currentNodeId;
  if (!current || !session.cycle) return { ...session, queueNodeIds: [], soonNodeIds: [], hiddenSoonNodeIds: [] };
  const next = await selectCycleSuccessor(db, { ...session.cycle }, { ...args, excluded: current });
  return { ...session, queueNodeIds: [current, ...(next ? [next.node_id] : [])], soonNodeIds: [], hiddenSoonNodeIds: [] };
}
