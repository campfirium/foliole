import { SPECIAL_ROOT_NODE_IDS } from '../../lib/core/database/nodeMutationSpecialRoots.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';
import { backfillMissingNodeSyncState } from './nodeSyncStateRows.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';

export { flushNodeSyncVersionWithDriver };

export function flushNodeSyncVersion(nodeId: string, now = new Date().toISOString()): string | null {
  const connection = openDatabaseConnection();
  return flushNodeSyncVersionWithDriver(
    connection.driver,
    nodeId,
    loadOrCreateDesktopDeviceId(now),
    now
  );
}

export function flushDirtyNodeSyncVersions(now = new Date().toISOString()) {
  const driver = openDatabaseConnection().driver;
  const nodeIds = driver.queryAll<{ id: string }>(
    `SELECT id FROM nodes
     WHERE id NOT IN (?, ?) AND (sync_dirty = 1 OR current_version_id IS NULL)
     ORDER BY updated_at ASC`,
    SPECIAL_ROOT_NODE_IDS
  ).map((row) => row.id);
  for (const nodeId of nodeIds) flushNodeSyncVersion(nodeId, now);
  return [...new Set([...nodeIds, ...backfillMissingNodeSyncState(driver)])];
}
