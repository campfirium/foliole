import { randomUUID } from 'node:crypto';

import { SPECIAL_ROOT_NODE_IDS } from '../../lib/core/database/nodeMutationSpecialRoots.js';

import { openDatabaseConnection } from './connection.js';
import { loadOrCreateDesktopDeviceId } from './deviceIdentity.js';
import { backfillMissingNodeSyncState } from './nodeSyncStateRows.js';
import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';

const RESTORE_INCARNATION_KEY = 'desktop_node_sync_restore_incarnation';

export { flushNodeSyncVersionWithDriver };

export function markNodeSyncRestoreIncarnation(now = new Date().toISOString()) {
  const incarnation = randomUUID();
  openDatabaseConnection().driver.execute(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [RESTORE_INCARNATION_KEY, incarnation, now]
  );
  return incarnation;
}

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
