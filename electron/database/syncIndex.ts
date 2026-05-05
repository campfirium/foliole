import type { DatabaseRow } from '../../lib/core/database/driver.js';
import type { NativeSyncIndexEntry } from '../../lib/platform/nativeStorageContract.js';

import { openDatabaseConnection } from './connection.js';

interface SyncIndexRow extends DatabaseRow {
  content_hash: string | null;
  object_id: string;
  object_type: string;
  sync_version_id: string | null;
  updated_at: string;
}

function toNativeSyncIndexEntry(row: SyncIndexRow): NativeSyncIndexEntry {
  return {
    content_hash: row.content_hash,
    object_id: row.object_id,
    object_type: 'node',
    sync_version_id: row.sync_version_id,
    updated_at: row.updated_at
  };
}

export function loadSyncIndex() {
  const rows = openDatabaseConnection().driver.queryAll<SyncIndexRow>(
    `SELECT
       'node' AS object_type,
       n.id AS object_id,
       n.current_version_id AS sync_version_id,
       v.content_hash AS content_hash,
       n.updated_at AS updated_at
     FROM nodes n
     LEFT JOIN node_sync_versions v
       ON v.version_id = n.current_version_id
     ORDER BY n.updated_at ASC, n.id ASC`
  );

  return rows.map((row) => toNativeSyncIndexEntry(row));
}
