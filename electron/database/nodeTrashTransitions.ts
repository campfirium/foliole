import type { NativeRestoreNodesArgs, NativeSoftDeleteNodesArgs, NativeTrashParentUpdate } from '../../lib/platform/nativeTrashCommandMap.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';
import { restoreNodes, softDeleteNodes } from './nodeMutations.js';
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

export function softDeleteNodesWithParents(input: NativeSoftDeleteNodesArgs) {
  return withTransaction(openDatabaseConnection().driver, () => {
    softDeleteNodes(input);
    persistParentUpdates(input.nodeIds, input.parentUpdates ?? []);
  });
}

export function restoreNodesWithParents(input: NativeRestoreNodesArgs) {
  return withTransaction(openDatabaseConnection().driver, () => {
    const result = restoreNodes(input);
    if (input.parentUpdates?.length && (result.skippedConflicts.length > 0 ||
        result.restoredNodeIds.length !== input.nodeIds.length ||
        !input.nodeIds.every((id) => result.restoredNodeIds.includes(id)))) {
      throw new Error('cannot restore complete Trash transition');
    }
    persistParentUpdates(input.nodeIds, input.parentUpdates ?? []);
    return result;
  });
}
