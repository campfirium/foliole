import { VIRTUAL_ROOT_NODE_ID } from '../../lib/core/database/specialNodeIds.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopHostName } from './hostProfile.js';
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
  const nodeIds = driver.queryAll<{ id: string }>(
    `SELECT id FROM nodes
     WHERE id != ? AND (sync_dirty = 1 OR current_version_id IS NULL)
     ORDER BY updated_at ASC`,
    [VIRTUAL_ROOT_NODE_ID]
  ).map((row) => row.id);
  for (const nodeId of nodeIds) flushNodeSyncVersion(nodeId, now);
  return [...new Set([...nodeIds, ...backfillMissingNodeSyncState(driver)])];
}

export function flushUntrackedDirtyNodeSyncVersions(now = new Date().toISOString()) {
  const driver = openDatabaseConnection().driver;
  const nodeIds = driver.queryAll<{ id: string }>(
    `SELECT n.id FROM nodes n
     WHERE n.id != ? AND n.sync_dirty = 1 AND n.current_version_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM sync_object_state s
         WHERE s.object_type = 'node' AND s.object_id = n.id)
     ORDER BY n.updated_at ASC, n.id ASC`,
    [VIRTUAL_ROOT_NODE_ID]
  ).map((row) => row.id);
  for (const nodeId of nodeIds) flushNodeSyncVersion(nodeId, now);
}
