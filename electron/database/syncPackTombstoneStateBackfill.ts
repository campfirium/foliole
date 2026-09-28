import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { upsertSyncObjectState } from '../../lib/core/database/syncState.js';

interface MissingTombstoneState extends DatabaseRow {
  content_hash: string;
  deleted_at: string;
  host_name: string;
  node_id: string;
  version_id: string;
}

/** Give legacy orphan deletions a durable scan position before choosing a page frontier. */
export function backfillMissingTombstoneSyncState(driver: DatabaseDriver) {
  let count = 0;
  while (true) {
    const rows = driver.queryAll<MissingTombstoneState>(
      `SELECT t.node_id, t.version_id, t.host_name, t.content_hash, t.deleted_at
       FROM node_sync_tombstones t
       WHERE NOT EXISTS (SELECT 1 FROM nodes n WHERE n.id = t.node_id)
         AND NOT EXISTS (SELECT 1 FROM sync_object_state s
           WHERE s.object_type = 'node' AND s.object_id = t.node_id)
       ORDER BY t.node_id LIMIT 128`
    );
    if (!rows.length) return count;
    for (const row of rows) {
      upsertSyncObjectState(driver, {
        objectType: 'node', objectId: row.node_id,
        currentVersionId: row.version_id, contentHash: row.content_hash,
        lastModifiedByHostName: row.host_name, updatedAt: row.deleted_at,
        deletedAt: row.deleted_at, syncDirty: false
      });
      count++;
    }
  }
}
