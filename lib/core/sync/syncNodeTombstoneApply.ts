import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';
import { markCompactDeletionSnapshot } from '../database/deletedNodeBodyRelease.js';

import type { DbPort, DbRow } from './dbPort.js';
import { enqueueAppliedNodeDeleteSearchInvalidation } from './syncNodeSearchInvalidations.js';
import { upsertAppliedNodeSyncState } from './syncNodeStateApplyExecutor.js';
import { deleteTopicAlternative } from './topicAlternativeApply.js';
import { serializeTopicTextSnapshot } from './topicTextBodies.js';

export interface NodeTombstoneRow extends DbRow {
  deleted_at: string;
  parent_version_id: string | null;
  version_id: string;
}

export async function loadBatchNodeSyncTombstones(port: DbPort, projections: readonly { object_id: string }[]) {
  const counts = new Map<string, number>();
  for (const { object_id: id } of projections) counts.set(id, (counts.get(id) ?? 0) + 1);
  const ids = [...counts].filter(([, count]) => count === 1).map(([id]) => id);
  const tombstones = new Map<string, NodeTombstoneRow | null>();
  if (ids.length < 2) return tombstones;
  const rows = await port.query<NodeTombstoneRow & { node_id: string }>(
    `SELECT node_id, version_id, parent_version_id, deleted_at
     FROM node_sync_tombstones WHERE node_id IN (SELECT value FROM json_each(?))`,
    [JSON.stringify(ids)]
  );
  for (const id of ids) tombstones.set(id, null);
  for (const row of rows) tombstones.set(row.node_id, row);
  return tombstones;
}

export async function loadNodeSyncTombstone(port: DbPort, nodeId: string) {
  const rows = await port.query<NodeTombstoneRow>(
    `SELECT version_id, parent_version_id, deleted_at
     FROM node_sync_tombstones
     WHERE node_id = ?
     LIMIT 1`,
    [nodeId]
  );
  return rows[0] ?? null;
}

const LOCAL_NODE_CLEANUP_TARGETS = [
  'review_log WHERE node_id = ?',
  'node_review WHERE node_id = ?',
  'node_reading WHERE node_id = ?',
  'node_reading_host_state WHERE node_id = ?',
  "sync_object_state WHERE object_type IN ('node_open_state', 'node_reading_resume') AND object_id = ?",
  // Phones keep a per-device reading position that references the node without cascading.
  'node_view_state WHERE node_id = ?',
  'nodes WHERE id = ?'
];

const LOCAL_NODE_CLEANUP_SQL = `
  SELECT 'child' AS kind, id FROM (
    SELECT id FROM nodes WHERE parent_id = ? ORDER BY id LIMIT 1
  )
  UNION ALL
  SELECT 'alternative', alternative_id FROM node_text_alternatives WHERE node_id = ?
  UNION ALL
  ${LOCAL_NODE_CLEANUP_TARGETS.map((target, index) =>
    `SELECT 'cleanup', ${index} WHERE EXISTS (SELECT 1 FROM ${target})`).join(' UNION ALL ')}`;

async function deleteLocalNodeRows(port: DbPort, nodeId: string, deletedAt: string) {
  const rows = await port.query<{ kind: 'child' | 'alternative'; id: string } | { kind: 'cleanup'; id: number }>(
    LOCAL_NODE_CLEANUP_SQL, [nodeId, nodeId, ...LOCAL_NODE_CLEANUP_TARGETS.map(() => nodeId)]);
  const child = rows.find(row => row.kind === 'child');
  if (child) throw new Error(`framed_sync_node_delete_child_pending:${child.id}`);
  for (const row of rows) {
    if (row.kind === 'alternative') await deleteTopicAlternative(port, row.id, deletedAt, undefined, nodeId);
  }
  const cleanupTargets = new Set(rows.flatMap(row => row.kind === 'cleanup' ? [row.id] : []));
  for (const [index, target] of LOCAL_NODE_CLEANUP_TARGETS.entries()) {
    if (cleanupTargets.has(index)) await port.run(`DELETE FROM ${target}`, [nodeId]);
  }
}

export async function applyRemoteNodeTombstone(
  port: DbPort, record: NativeSyncNodeRecord, enqueueSearchInvalidations = true
) {
  if (!record.version_id || !record.host_name || !record.content_hash || !record.snapshot.deleted_at) {
    return false;
  }
  const createdAt = record.version_created_at ?? record.snapshot.deleted_at;
  await assertKnownDeletionIdentity(port, record);
  await port.run(
    `INSERT INTO node_sync_tombstones (
       node_id,
       version_id,
       parent_version_id,
       host_name,
       content_hash,
       snapshot_json,
       deleted_at,
       created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(node_id) DO UPDATE SET
       version_id = excluded.version_id,
       parent_version_id = excluded.parent_version_id,
       host_name = excluded.host_name,
       content_hash = excluded.content_hash,
       snapshot_json = excluded.snapshot_json,
       deleted_at = excluded.deleted_at,
       created_at = excluded.created_at`,
    [
      record.object_id,
      record.version_id,
      record.parent_version_id,
      record.host_name,
      record.content_hash,
      markCompactDeletionSnapshot(JSON.parse(serializeTopicTextSnapshot(record))),
      record.snapshot.deleted_at,
      createdAt
    ]
  );
  await deleteLocalNodeRows(port, record.object_id, record.snapshot.deleted_at);
  await upsertAppliedNodeSyncState(port, record);
  if (enqueueSearchInvalidations) {
    await enqueueAppliedNodeDeleteSearchInvalidation(port, record.object_id, createdAt);
  }
  return true;
}

/**
 * A deletion arriving without its text cannot be checked against its hash, so it must at least agree with
 * the same deletion this device already holds. Its hash may legitimately differ from its version's.
 */
export async function assertKnownDeletionIdentity(port: DbPort, record: NativeSyncNodeRecord) {
  const known = await port.query<{ object_id: string; content_hash: string; host_name: string;
    parent_version_id: string | null }>(`SELECT node_id AS object_id, content_hash, host_name, parent_version_id
    FROM node_sync_tombstones WHERE version_id = ?`, [record.version_id]);
  for (const row of known) {
    if (row.object_id !== record.object_id || row.content_hash !== record.content_hash ||
        row.host_name !== record.host_name || (row.parent_version_id ?? null) !== (record.parent_version_id ?? null)) {
      throw new Error(`sync_pack_node_version_immutable_mismatch:${record.version_id}`);
    }
  }
}
