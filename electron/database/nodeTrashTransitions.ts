import { restoreDeletedParentOrders } from '../../lib/core/database/restoreDeletedParentOrders.js';
import { loadVisibleWorkspaceNodeOrder } from '../../lib/core/database/workspaceVisibleNodeOrder.js';
import type { NativeRestoreNodesResult } from '../../lib/platform/nativeNodeMutationContract.js';
import type { NativeRestoreNodesArgs, NativeSoftDeleteNodesArgs, NativeTrashParentUpdate } from '../../lib/platform/nativeTrashCommandMap.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';
import { restoreNodes, softDeleteNodesDeferringSyncVersions } from './nodeMutations.js';
import { scheduleNodeSyncVersionDrain } from './nodeSyncVersionDrain.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { withTransaction } from './transaction.js';

function persistParentUpdates(nodeIds: string[], updates: NativeTrashParentUpdate[]) {
  const driver = openDatabaseConnection().driver;
  for (const update of updates) {
    const parent = driver.queryOne<{ id: string }>(
      'SELECT id FROM nodes WHERE id = ? AND deleted_at IS NULL', [update.nodeId]
    );
    const isParent = nodeIds.some((nodeId) => driver.queryOne(
      'SELECT id FROM nodes WHERE id = ? AND parent_id = ?', [nodeId, update.nodeId]
    ));
    if (!parent || !isParent || nodeIds.includes(update.nodeId)) {
      throw new Error('invalid Trash parent update');
    }
    const hostName = loadOrCreateDesktopHostName(update.updatedAt);
    flushNodeSyncVersionWithDriver(driver, update.nodeId, hostName, update.updatedAt);
    driver.execute(
      `UPDATE nodes SET image_regions = ?, updated_at = ?, last_modified_by_host_name = ?, sync_dirty = 1
       WHERE id = ?`,
      [update.imageRegions?.length ? JSON.stringify(update.imageRegions) : null,
        update.updatedAt, hostName, update.nodeId]
    );
    flushNodeSyncVersionWithDriver(driver, update.nodeId, hostName, update.updatedAt);
  }
}

function persistManualOrders(orders: Array<{ parentNodeId: string; childIds: string[] }>) {
  const driver = openDatabaseConnection().driver;
  return orders.map(order => {
    const current = driver.queryOne<{ manual_child_order: string | null; updated_at: string }>(
      'SELECT manual_child_order, updated_at FROM nodes WHERE id = ?', [order.parentNodeId])!;
    const serialized = JSON.stringify(order.childIds);
    if (current.manual_child_order === serialized) return { ...order, updatedAt: current.updated_at };
    const updatedAt = new Date().toISOString();
    const hostName = loadOrCreateDesktopHostName(updatedAt);
    flushNodeSyncVersionWithDriver(driver, order.parentNodeId, hostName, updatedAt);
    driver.execute(`UPDATE nodes SET manual_child_order = ?, updated_at = ?, last_modified_by_host_name = ?, sync_dirty = 1
      WHERE id = ?`, [serialized, updatedAt, hostName, order.parentNodeId]);
    flushNodeSyncVersionWithDriver(driver, order.parentNodeId, hostName, updatedAt);
    return { ...order, updatedAt };
  });
}

/** Commits the visible Trash state; the deleted nodes' sync versions follow in background batches. */
export function softDeleteNodesWithParents(input: NativeSoftDeleteNodesArgs) {
  withTransaction(openDatabaseConnection().driver, () => {
    softDeleteNodesDeferringSyncVersions(input);
    persistParentUpdates(input.nodeIds, input.parentUpdates ?? []);
  });
  scheduleNodeSyncVersionDrain();
}

export function restoreNodesWithParents(input: NativeRestoreNodesArgs): NativeRestoreNodesResult {
  const driver = openDatabaseConnection().driver;
  const result = withTransaction(driver, () => {
    const restored = restoreNodes(input);
    if ((input.parentUpdates?.length || input.parentOrders) && (restored.skippedConflicts.length > 0 ||
        restored.restoredNodeIds.length !== input.nodeIds.length ||
        !input.nodeIds.every((id) => restored.restoredNodeIds.includes(id)))) {
      throw new Error('cannot restore complete Trash transition');
    }
    persistParentUpdates(input.nodeIds, input.parentUpdates ?? []);
    const manualParentOrders = input.parentOrders
      ? persistManualOrders(restoreDeletedParentOrders(driver, restored.restoredNodeIds, input.parentOrders)) : [];
    return { ...restored, nodeOrder: loadVisibleWorkspaceNodeOrder(driver),
      ...(manualParentOrders.length ? { manualParentOrders } : {}) };
  });
  scheduleNodeSyncVersionDrain();
  return result;
}
