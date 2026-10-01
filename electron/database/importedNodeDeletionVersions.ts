import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { requireDatabaseHostName } from '../../lib/core/database/syncHostIdentity.js';

import { flushNodeSyncVersionWithDriver } from './nodeSyncVersionFromDriver.js';

export function prepareImportedNodeDeletionVersions(driver: DatabaseDriver, nodeIds: string[], deletedAt: string) {
  if (!nodeIds.length) return;
  const hostName = requireDatabaseHostName(driver);
  for (const nodeId of nodeIds) {
    const versioned = driver.queryOne('SELECT current_version_id FROM nodes WHERE id = ? AND current_version_id IS NOT NULL',
      [nodeId]);
    if (!versioned) continue;
    driver.execute(`UPDATE nodes SET deleted_at = ?, updated_at = ?, last_modified_by_host_name = ?, sync_dirty = 1
      WHERE id = ?`, [deletedAt, deletedAt, hostName, nodeId]);
    if (!flushNodeSyncVersionWithDriver(driver, nodeId, hostName, deletedAt)) {
      throw new Error('imported_node_deletion_body_unavailable');
    }
  }
}
