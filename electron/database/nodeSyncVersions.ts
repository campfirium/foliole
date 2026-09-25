import { SPECIAL_ROOT_NODE_IDS } from '../../lib/core/database/nodeMutationSpecialRoots.js';

import { openDatabaseConnection } from './connection.js';
import { loadDesktopHostName, loadOrCreateDesktopHostName } from './hostProfile.js';
import { markUnversionedNodeOrderDirty } from './nodeOrderVersionRepair.js';
import { backfillMissingNodeSyncState } from './nodeSyncStateRows.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';

export { flushNodeSyncVersionWithDriver };

export function flushNodeSyncVersion(nodeId: string, now = new Date().toISOString()): string | null {
  const connection = openDatabaseConnection();
  return flushNodeSyncVersionWithDriver(
    connection.driver,
    nodeId,
    loadOrCreateDesktopHostName(now),
    now
  );
}

export function flushDirtyNodeSyncVersions(now = new Date().toISOString()) {
  const driver = openDatabaseConnection().driver;
  const hostName = loadDesktopHostName();
  if (hostName) markUnversionedNodeOrderDirty(driver, hostName);
  const nodeIds = driver.queryAll<{ id: string }>(
    `SELECT id FROM nodes
     WHERE id NOT IN (?, ?) AND (sync_dirty = 1 OR current_version_id IS NULL)
     ORDER BY updated_at ASC`,
    SPECIAL_ROOT_NODE_IDS
  ).map((row) => row.id);
  for (const nodeId of nodeIds) flushNodeSyncVersion(nodeId, now);
  return [...new Set([...nodeIds, ...backfillMissingNodeSyncState(driver)])];
}

export function flushUntrackedDirtyNodeSyncVersions(now = new Date().toISOString()) {
  const driver = openDatabaseConnection().driver;
  const nodeIds = driver.queryAll<{ id: string }>(
    `SELECT n.id FROM nodes n
     WHERE n.id NOT IN (?, ?) AND n.sync_dirty = 1 AND n.current_version_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM sync_object_state s
         WHERE s.object_type = 'node' AND s.object_id = n.id)
     ORDER BY n.updated_at ASC, n.id ASC`,
    SPECIAL_ROOT_NODE_IDS
  ).map((row) => row.id);
  for (const nodeId of nodeIds) flushNodeSyncVersion(nodeId, now);
}
