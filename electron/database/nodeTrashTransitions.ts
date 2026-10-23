import type { NativeRestoreNodesArgs, NativeSoftDeleteNodesArgs, NativeTrashParentUpdate } from '../../lib/platform/nativeTrashCommandMap.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';
import { restoreNodes, softDeleteNodesDeferringSyncVersions } from './nodeMutations.js';
import { scheduleNodeSyncVersionDrain } from './nodeSyncVersionDrain.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';
import { withTransaction } from './transaction.js';
import { loadWorkspaceListSnapshot } from './workspaceListSnapshot.js';

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

/** Commits the visible Trash state; the deleted nodes' sync versions follow in background batches. */
export function softDeleteNodesWithParents(input: NativeSoftDeleteNodesArgs) {
  withTransaction(openDatabaseConnection().driver, () => {
    softDeleteNodesDeferringSyncVersions(input);
    persistParentUpdates(input.nodeIds, input.parentUpdates ?? []);
  });
  scheduleNodeSyncVersionDrain();
}

export function restoreNodesWithParents(input: NativeRestoreNodesArgs) {
  const result = withTransaction(openDatabaseConnection().driver, () => {
    const restored = restoreNodes(input);
    if (input.parentUpdates?.length && (restored.skippedConflicts.length > 0 ||
        restored.restoredNodeIds.length !== input.nodeIds.length ||
        !input.nodeIds.every((id) => restored.restoredNodeIds.includes(id)))) {
      throw new Error('cannot restore complete Trash transition');
    }
    persistParentUpdates(input.nodeIds, input.parentUpdates ?? []);
    return { ...restored, nodeOrder: loadWorkspaceListSnapshot()?.nodeOrder ?? [] };
  });
  scheduleNodeSyncVersionDrain();
  return result;
}
