import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { VIRTUAL_ROOT_NODE_ID } from '../../lib/core/database/specialNodeIds.js';
import { upsertSyncObjectState } from '../../lib/core/database/syncState.js';

interface MissingNodeSyncStateRow extends DatabaseRow {
  content_hash: string;
  current_version_id: string;
  deleted_at: string | null;
  host_name: string;
  id: string;
  last_modified_by_host_name: string | null;
  updated_at: string;
}

export function upsertNodeSyncState(args: {
  contentHash: string;
  currentVersionId: string;
  deletedAt: string | null;
  hostName: string;
  nodeId: string;
  updatedAt: string;
}, driver: DatabaseDriver) {
  upsertSyncObjectState(driver, {
    objectType: 'node',
    objectId: args.nodeId,
    currentVersionId: args.currentVersionId,
    contentHash: args.contentHash,
    lastModifiedByHostName: args.hostName,
    updatedAt: args.updatedAt,
    deletedAt: args.deletedAt,
    syncDirty: false
  });
}

/** Pending repairs come from the local queue, so an idle library never rescans its nodes. */
export function backfillMissingNodeSyncState(
  driver: DatabaseDriver,
  collectIds = true
) {
  const ids: string[] = [];
  while (true) {
    const rows = driver.queryAll<MissingNodeSyncStateRow>(
    `SELECT
       n.id,
       n.current_version_id,
       n.last_modified_by_host_name,
       n.updated_at,
       n.deleted_at,
       v.host_name,
       v.content_hash
     FROM node_sync_state_backfill queued
     INNER JOIN nodes n ON n.id = queued.node_id
     LEFT JOIN sync_object_state s ON s.object_type = 'node' AND s.object_id = n.id
     INNER JOIN node_sync_versions v ON v.version_id = n.current_version_id
     WHERE n.id != ? AND n.current_version_id IS NOT NULL AND s.object_id IS NULL
     ORDER BY n.updated_at ASC, n.id ASC LIMIT 128`,
    [VIRTUAL_ROOT_NODE_ID]
    );
    if (!rows.length) break;
    for (const row of rows) {
      upsertNodeSyncState({
        contentHash: row.content_hash,
        currentVersionId: row.current_version_id,
        deletedAt: row.deleted_at,
        hostName: row.last_modified_by_host_name ?? row.host_name,
        nodeId: row.id,
        updatedAt: row.updated_at
      }, driver);
      if (collectIds) ids.push(row.id);
    }
  }
  // Whatever is left cannot be repaired now; the queue triggers add it back once it can.
  driver.execute('DELETE FROM node_sync_state_backfill');
  return ids;
}
