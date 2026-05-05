import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

export interface LocalNodeSyncState extends DatabaseRow {
  current_version_id: string | null;
  deleted_at: string | null;
  sync_dirty: number;
}

export function loadLocalNodeSyncState(driver: DatabaseDriver, nodeId: string) {
  return driver.queryOne<LocalNodeSyncState>(
    `SELECT current_version_id, deleted_at, sync_dirty
     FROM nodes
     WHERE id = ?`,
    [nodeId]
  );
}

export function blocksIncomingNodeVersion(local: LocalNodeSyncState, record: NativeSyncNodeRecord) {
  if (record.version_id === local.current_version_id) {
    return false;
  }
  if (record.snapshot.deleted_at) {
    return false;
  }
  if (local.sync_dirty === 1) {
    return true;
  }
  return Boolean(local.deleted_at && !record.snapshot.deleted_at);
}
