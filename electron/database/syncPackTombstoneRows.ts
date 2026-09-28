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

export function loadSyncPackTombstoneRows(driver: DatabaseDriver,
  page?: { fromStateSeq: number; toStateSeq: number }) {
  return driver.queryAll<SyncPackTombstoneRow>(
    `SELECT node_id, version_id, parent_version_id, host_name, content_hash,
      snapshot_json, deleted_at, created_at FROM node_sync_tombstones t
     ${page ? `WHERE EXISTS (SELECT 1 FROM sync_object_state s
       WHERE s.object_type = 'node' AND s.object_id = t.node_id
         AND s.deleted_at IS NOT NULL AND s.state_seq > ? AND s.state_seq <= ?)` : ''}
     ORDER BY node_id`,
    page ? [page.fromStateSeq, page.toStateSeq] : []
  );
}
