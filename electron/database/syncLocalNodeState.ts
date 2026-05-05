import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import type { LocalSyncNodeState } from '../../lib/core/sync/syncNodeApplyRules.js';

export interface LocalNodeSyncState extends DatabaseRow, LocalSyncNodeState {}

export function loadLocalNodeSyncState(driver: DatabaseDriver, nodeId: string) {
  return driver.queryOne<LocalNodeSyncState>(
    `SELECT current_version_id, deleted_at, sync_dirty
     FROM nodes
     WHERE id = ?`,
    [nodeId]
  );
}
