import { loadParentOrderSourcesWithDbPort, ROOT_CHILD_ORDER_ID } from '../../../../../lib/core/database/parentChildOrder';
import { currentParentOrderHash, parseParentOrderSources } from '../../../../../lib/core/sync/currentParentOrder';
import { loadCurrentParentOrderSources } from '../../../../../lib/core/sync/currentParentOrderStore';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import type { WorkspaceNodeMetadataHistoryEntry } from '../../../../store/workspaceNodeMetadataHistory';

type Order = WorkspaceNodeMetadataHistoryEntry['orders'][number];

async function parentOrderFingerprint(db: DbPort, parentId: string) {
  return currentParentOrderHash(parentId, await loadCurrentParentOrderSources(db, parentId));
}

/**
 * Fingerprints the order sources of the parents a move left and entered. A move rewrites only node parents,
 * never order sources, and a parent's order is a function of its sources and members; replaying the parent
 * change therefore restores every sibling placement, and only a reorder in between must stop the replay.
 * Children are never read, so the record does not grow with the size of the folders involved.
 */
export async function recordCompanionHistoryOrders(db: DbPort, parentIds: (string | null)[]) {
  const ids = [...new Set(parentIds.map(id => id ?? ROOT_CHILD_ORDER_ID))];
  if (!ids.length) return [];
  // Both parents of a move are read together.
  const sources = await loadParentOrderSourcesWithDbPort(db, ids);
  return ids.map((parentId): Order => ({ parentId,
    sources: currentParentOrderHash(parentId, parseParentOrderSources(sources.get(parentId) ?? [])) }));
}

export async function validateCompanionHistoryOrders(db: DbPort, orders: Order[]) {
  for (const order of orders) {
    // Entries from before fingerprints carry complete child lists and replay without an order check.
    if (!('sources' in order)) continue;
    if (await parentOrderFingerprint(db, order.parentId) !== order.sources) throw new Error('workspace_history_order_changed');
  }
}
