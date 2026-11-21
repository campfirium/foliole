import type { DatabaseDriver } from './driver.js';
import { readParentChildOrder } from './parentChildOrder.js';

export interface VisibleChildOrder {
  parentNodeId: string | null;
  childIds: string[];
}

/**
 * The visible child sequence of every parent whose children a restore changed: the restored nodes'
 * parents and the restored nodes themselves. The rest of the list order is unchanged, so the
 * renderer rebuilds it from these sequences instead of rereading the whole library.
 */
export function loadRestoredChildOrders(driver: DatabaseDriver, restoredNodeIds: readonly string[]): VisibleChildOrder[] {
  if (!restoredNodeIds.length) return [];
  const rows = driver.queryAll<{ id: string; parent_id: string | null }>(
    'SELECT id, parent_id FROM nodes WHERE id IN (SELECT value FROM json_each(?))', [JSON.stringify(restoredNodeIds)]);
  const parents = new Set<string | null>([...rows.map(row => row.parent_id), ...rows.map(row => row.id)]);
  return [...parents].map(parentNodeId => {
    const { childIds, byId } = readParentChildOrder(driver, parentNodeId);
    return { parentNodeId, childIds: childIds.filter(id => !byId.get(id)?.deleted_at) };
  });
}
