import { ROOT_CHILD_ORDER_ID } from '../database/parentChildOrder.js';
import { isFsrsReviewItemNode } from '../review/reviewItemKind.js';
import type { DbPort } from '../sync/dbPort.js';

import type { CycleRow } from './cycleFlowTypes.js';
import type { DailyFlowLearningSnapshot, DailyFlowSettings } from './dailyFlowContract.js';
import type { CycleReconcileScope, CycleStored, DailyFlowStore } from './dailyFlowStore.js';

/** How one pending reconcile runs: over `scope` alone, or over the whole list when it is absent. */
export type DirtyReconcilePlan = { scope?: CycleReconcileScope; settle(): Promise<void> };

/**
 * The recorded dirty nodes, with the subtrees they head, are the only entries a reconcile must recheck while
 * the last whole-list check still holds for the rest. Anything this cannot vouch for falls back to the whole list.
 */
export async function planDirtyReconcile(db: DbPort, store: Pick<DailyFlowStore, 'readRows' | 'scopedLearningSnapshot'>,
  stored: CycleStored, settings: DailyFlowSettings): Promise<DirtyReconcilePlan> {
  const whole = { settle: () => completeReconcileScope(db) };
  if (!stored.invalidated || !stored.scope_complete || stored.settings_key !== JSON.stringify(settings) || stored.session.dive) {
    return whole;
  }
  const dirty = (await db.query<{ node_id: string }>('SELECT node_id FROM daily_flow_dirty_nodes')).map(row => row.node_id);
  const ids = await dirtyEntryIds(db, dirty);
  const rows = await store.readRows(ids);
  const snapshot = await store.scopedLearningSnapshot(ids);
  if (!rows.every(row => isScopeCheckable(row, snapshot))) return whole;
  const tasks = rows.filter(row => row.active && row.initial_task);
  const counted = { remaining: tasks.length,
    reviewRemaining: tasks.filter(row => isFsrsReviewItemNode(snapshot.nodesById[row.node_id])).length };
  return { scope: { ids, counted }, settle: async () => { await db.run(
    'DELETE FROM daily_flow_dirty_nodes WHERE node_id IN (SELECT value FROM json_each(?))', [JSON.stringify(dirty)]); } };
}

/** A whole-list build or reconcile has checked every entry, so every recorded change is handled. */
export async function completeReconcileScope(db: DbPort) {
  await db.run('DELETE FROM daily_flow_dirty_nodes');
  await db.run('UPDATE daily_flow_state SET scope_complete = 1 WHERE id = 1');
}

// Child order alone never changes which entries are eligible, so the top-level order key is not a subtree.
function dirtyEntryIds(db: DbPort, dirty: readonly string[]) {
  if (!dirty.length) return Promise.resolve([]);
  return db.query<{ node_id: string }>(`WITH RECURSIVE scope(id) AS (
      SELECT value FROM json_each(?) WHERE value <> ?
      UNION SELECT n.id FROM nodes n JOIN scope s ON n.parent_id = s.id
    ) SELECT e.node_id FROM scope s JOIN daily_flow_entries e ON e.node_id = s.id ORDER BY e.node_id`,
  [JSON.stringify(dirty), ROOT_CHILD_ORDER_ID]).then(rows => rows.map(row => row.node_id));
}

/**
 * A counted entry whose node is gone left no kind to take its share back out of the counts, and a node cut
 * off from the root is placed differently by each host's whole-list order; both need the whole list.
 */
function isScopeCheckable(row: CycleRow, snapshot: DailyFlowLearningSnapshot) {
  const node = snapshot.nodesById[row.node_id];
  if (!node) return !(row.active && row.initial_task);
  const seen = new Set<string>();
  let current = node;
  while (current.parentNodeId) {
    const parent = snapshot.nodesById[current.parentNodeId];
    if (!parent || seen.has(parent.id)) return false;
    seen.add(current.id);
    current = parent;
  }
  return true;
}
