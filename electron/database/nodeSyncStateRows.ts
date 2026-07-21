import type { DatabaseDriver, DatabaseRow } from '../../lib/core/database/driver.js';
import { upsertSyncObjectState } from '../../lib/core/database/syncState.js';

interface MissingNodeSyncStateRow extends DatabaseRow {
  content_hash: string;
  current_version_id: string;
  deleted_at: string | null;
  device_id: string;
  id: string;
  last_modified_by_device_id: string | null;
  updated_at: string;
}

export function upsertNodeSyncState(args: {
  contentHash: string;
  currentVersionId: string;
  deletedAt: string | null;
  deviceId: string;
  nodeId: string;
  updatedAt: string;
}, driver: DatabaseDriver) {
  upsertSyncObjectState(driver, {
    objectType: 'node',
    objectId: args.nodeId,
    currentVersionId: args.currentVersionId,
    contentHash: args.contentHash,
    lastModifiedByDeviceId: args.deviceId,
    updatedAt: args.updatedAt,
    deletedAt: args.deletedAt,
    syncDirty: false
  });
}

export function backfillMissingNodeSyncState(
  driver: DatabaseDriver
) {
  const rows = driver.queryAll<MissingNodeSyncStateRow>(
    `SELECT
       n.id,
       n.current_version_id,
       n.last_modified_by_device_id,
       n.updated_at,
       n.deleted_at,
       v.device_id,
       v.content_hash
     FROM nodes n
     INNER JOIN node_sync_versions v ON v.version_id = n.current_version_id
     LEFT JOIN sync_object_state s ON s.object_type = 'node' AND s.object_id = n.id
     WHERE n.current_version_id IS NOT NULL AND s.object_id IS NULL
     ORDER BY n.updated_at ASC, n.id ASC`
  );
  for (const row of rows) {
    upsertNodeSyncState({
      contentHash: row.content_hash,
      currentVersionId: row.current_version_id,
      deletedAt: row.deleted_at,
      deviceId: row.last_modified_by_device_id ?? row.device_id,
      nodeId: row.id,
      updatedAt: row.updated_at
    }, driver);
  }
  return rows.map((row) => row.id);
}
