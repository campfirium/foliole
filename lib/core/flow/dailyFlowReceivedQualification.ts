import { projectParentChildOrder } from '../database/parentChildOrder.js';
import type { DbPort } from '../sync/dbPort.js';

import { chooseCycleCurrent, isCycleCurrentReady, reconcileCycle } from './cycleFlowOpen.js';
import type { CycleRow } from './cycleFlowTypes.js';
import type { DailyFlowSettings } from './dailyFlowContract.js';
import { dailyFlowOpenSchema } from './dailyFlowContract.js';
import { loadDailyFlowLearningSnapshot } from './dailyFlowLearningSnapshot.js';
import { readDailyFlow, readCycleRows, saveCycleFlow, writeCycleRows } from './dailyFlowStorage.js';
import type { DailyFlowStore } from './dailyFlowStore.js';

/** Receive applies no learning mutations; it uses the same eligibility and successor implementation as opening Flow. */
export async function qualifyReceivedDailyFlow(db: DbPort, hostName: string) {
  const stored = await readDailyFlow(db);
  if (!stored) return;
  const settings = JSON.parse(stored.settings_key) as DailyFlowSettings;
  const mode = dailyFlowOpenSchema.shape.mode.parse(stored.mode);
  const [head] = await db.query<{ occurred_at: string }>(`SELECT f.occurred_at FROM daily_flow_sync_projection p
    JOIN daily_flow_sync_facts f ON f.id=p.head_id WHERE p.id=1`);
  if (!head) throw new Error('daily_flow_receive_head_missing');
  const adapter = learningStore(db, hostName);
  const reconciled = await reconcileCycle(adapter, stored, head.occurred_at, settings);
  const session = { ...reconciled };
  if (!await isCycleCurrentReady(adapter, session, mode, head.occurred_at, settings)) {
    await chooseCycleCurrent(adapter, session, mode, head.occurred_at, settings);
  } else if (stored.session.cycle?.change) session.cycle!.change = stored.session.cycle.change;
  await saveCycleFlow(db, { dayKey: stored.day_key, mode: stored.mode, settingsKey: stored.settings_key,
    now: head.occurred_at, revision: stored.revision + 1, session });
}

function learningStore(db: DbPort, hostName: string) {
  const learningSnapshot = async () => {
    const snapshot = await loadDailyFlowLearningSnapshot(db, hostName);
    const nodes = await db.query<{ id: string; parent_id: string | null; created_at: string; deleted_at: string | null }>(
      'SELECT id,parent_id,created_at,deleted_at FROM nodes');
    const orders = await db.query<{ parent_id: string; child_ids_json: string }>('SELECT parent_id,child_ids_json FROM parent_child_order');
    return { ...snapshot, nodeOrder: projectParentChildOrder(nodes,
      new Map(orders.map(row => [row.parent_id, JSON.parse(row.child_ids_json) as string[]]))) };
  };
  return {
    learningSnapshot, readRows: (ids?: readonly string[]) => readCycleRows(db, ids),
    writeRows: (rows: Parameters<typeof writeCycleRows>[1]) => writeCycleRows(db, rows),
    scopedLearningSnapshot: (ids: readonly (string | null | undefined)[]) =>
      loadDailyFlowLearningSnapshot(db, hostName, ids.filter((id): id is string => typeof id === 'string')),
    scanRows: (after: number, through: number, count: number) => db.query<CycleRow & Record<string, unknown>>(`SELECT * FROM daily_flow_entries
      WHERE active=1 AND order_key>? AND order_key<=? ORDER BY order_key LIMIT ?`, [after, through, count])
  } satisfies Pick<DailyFlowStore, 'learningSnapshot' | 'readRows' | 'writeRows' | 'scopedLearningSnapshot' | 'scanRows'>;
}
