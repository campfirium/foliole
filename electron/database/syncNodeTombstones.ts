import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { openDatabaseConnection } from './connection.js';

interface SyncNodeTombstoneRow extends DatabaseRow {
  content_hash: string;
  created_at: string;
  deleted_at: string;
  device_id: string;
  node_id: string;
  parent_version_id: string | null;
  snapshot_json: string;
  version_id: string;
}

function toNativeSyncNodeTombstone(row: SyncNodeTombstoneRow): NativeSyncNodeRecord {
  const snapshot = JSON.parse(row.snapshot_json) as NativeSyncNodeRecord['snapshot'];
  return {
    ancestor_version_ids: row.parent_version_id ? [row.parent_version_id] : [],
    content_hash: row.content_hash,
    device_id: row.device_id,
    is_tombstone: true,
    object_id: row.node_id,
    object_type: 'node',
    parent_version_id: row.parent_version_id,
    snapshot,
    updated_at: snapshot.updated_at,
    version_created_at: row.created_at,
    version_id: row.version_id
  };
}

export function loadSyncNodeTombstoneVersionsSince(
  cursor: { createdAt: string; versionId: string } | null,
  limit: number
) {
  const rows = openDatabaseConnection().driver.queryAll<SyncNodeTombstoneRow>(
    `SELECT
       node_id,
       version_id,
       parent_version_id,
       device_id,
       content_hash,
       snapshot_json,
       deleted_at,
       created_at
     FROM node_sync_tombstones
     WHERE ${cursor ? '(created_at > ? OR (created_at = ? AND version_id > ?))' : '1 = 1'}
       AND node_id NOT LIKE 'conflict-copy-%'
     ORDER BY created_at ASC, version_id ASC
     LIMIT ?`,
    cursor
      ? [cursor.createdAt, cursor.createdAt, cursor.versionId, limit]
      : [limit]
  );
  return rows.map(toNativeSyncNodeTombstone);
}
