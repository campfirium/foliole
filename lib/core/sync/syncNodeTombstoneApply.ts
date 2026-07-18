import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort, DbRow } from './dbPort.js';
import { enqueueAppliedNodeDeleteSearchInvalidation } from './syncNodeSearchInvalidations.js';
import { upsertAppliedNodeSyncState } from './syncNodeStateApplyExecutor.js';

interface NodeTombstoneRow extends DbRow {
  deleted_at: string;
  version_id: string;
}

export async function loadNodeSyncTombstone(port: DbPort, nodeId: string) {
  const rows = await port.query<NodeTombstoneRow>(
    `SELECT version_id, deleted_at
     FROM node_sync_tombstones
     WHERE node_id = ?
     LIMIT 1`,
    [nodeId]
  );
  return rows[0] ?? null;
}

async function deleteLocalNodeRows(port: DbPort, nodeId: string) {
  await port.run('DELETE FROM review_log WHERE node_id = ?', [nodeId]);
  await port.run('DELETE FROM node_review WHERE node_id = ?', [nodeId]);
  await port.run('DELETE FROM node_reading WHERE node_id = ?', [nodeId]);
  await port.run('DELETE FROM node_reading_device_state WHERE node_id = ?', [nodeId]);
  await port.run('DELETE FROM node_order WHERE node_id = ?', [nodeId]);
  await port.run('DELETE FROM node_attachments WHERE node_id = ?', [nodeId]);
  await port.run('DELETE FROM nodes WHERE id = ?', [nodeId]);
}

export async function applyRemoteNodeTombstone(port: DbPort, record: NativeSyncNodeRecord) {
  if (!record.version_id || !record.device_id || !record.content_hash || !record.snapshot.deleted_at) {
    return false;
  }
  const createdAt = record.version_created_at ?? record.snapshot.deleted_at;
  await port.run(
    `INSERT INTO node_sync_tombstones (
       node_id,
       version_id,
       parent_version_id,
       device_id,
       content_hash,
       snapshot_json,
       deleted_at,
       created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(node_id) DO UPDATE SET
       version_id = excluded.version_id,
       parent_version_id = excluded.parent_version_id,
       device_id = excluded.device_id,
       content_hash = excluded.content_hash,
       snapshot_json = excluded.snapshot_json,
       deleted_at = excluded.deleted_at,
       created_at = excluded.created_at`,
    [
      record.object_id,
      record.version_id,
      record.parent_version_id,
      record.device_id,
      record.content_hash,
      JSON.stringify(record.snapshot),
      record.snapshot.deleted_at,
      createdAt
    ]
  );
  await deleteLocalNodeRows(port, record.object_id);
  await upsertAppliedNodeSyncState(port, record);
  await enqueueAppliedNodeDeleteSearchInvalidation(port, record.object_id, createdAt);
  return true;
}
