import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';

export interface SyncPackTombstoneRow extends DatabaseRow {
  node_id: string;
  version_id: string;
  parent_version_id: string | null;
  host_name: string;
  content_hash: string;
  snapshot_json: string;
  deleted_at: string;
  created_at: string;
}

export function loadSyncPackTombstoneRows(driver: DatabaseDriver) {
  return driver.queryAll<SyncPackTombstoneRow>(
    `SELECT node_id, version_id, parent_version_id, host_name, content_hash,
      snapshot_json, deleted_at, created_at FROM node_sync_tombstones ORDER BY node_id`
  );
}
