import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort, DbRow } from './dbPort.js';
import { applyRemoteNodeTombstone } from './syncNodeTombstoneApply.js';

interface PackTombstoneRow extends DbRow {
  node_id: string;
  version_id: string;
  parent_version_id: string | null;
  host_name: string;
  content_hash: string;
  snapshot_json: string;
  deleted_at: string;
  created_at: string;
}

function parseTombstone(row: PackTombstoneRow): NativeSyncNodeRecord {
  let snapshot: NativeSyncNodeRecord['snapshot'];
  try {
    snapshot = JSON.parse(row.snapshot_json) as NativeSyncNodeRecord['snapshot'];
  } catch {
    throw new Error(`sync_pack_node_tombstone_invalid:${row.node_id}`);
  }
  if (!row.node_id || !row.version_id || !row.host_name || !row.content_hash ||
      snapshot.id !== row.node_id || snapshot.deleted_at !== row.deleted_at) {
    throw new Error(`sync_pack_node_tombstone_invalid:${row.node_id}`);
  }
  return {
    ancestor_version_ids: [],
    content_hash: row.content_hash,
    host_name: row.host_name,
    is_tombstone: true,
    object_id: row.node_id,
    object_type: 'node',
    parent_version_id: row.parent_version_id,
    snapshot,
    updated_at: row.deleted_at,
    version_created_at: row.created_at,
    version_id: row.version_id
  };
}

export async function applySyncPackNodeTombstonesWithDbPort(port: DbPort, incomingAlias = 'inc') {
  const alias = `"${incomingAlias.replaceAll('"', '""')}"`;
  const rows = await port.query<PackTombstoneRow>(
    `SELECT node_id, version_id, parent_version_id, host_name, content_hash,
      snapshot_json, deleted_at, created_at FROM ${alias}.node_sync_tombstones incoming
     WHERE NOT EXISTS (
       SELECT 1 FROM main.node_sync_tombstones current
       WHERE current.node_id = incoming.node_id
     )
     ORDER BY node_id`
  );
  const records = rows.map(parseTombstone);
  const byId = new Map(records.map((record) => [record.object_id, record]));
  const depthById = new Map<string, number>();
  const visiting = new Set<string>();
  const depth = (nodeId: string): number => {
    if (depthById.has(nodeId)) return depthById.get(nodeId)!;
    if (visiting.has(nodeId)) throw new Error(`sync_pack_node_tombstone_cycle:${nodeId}`);
    visiting.add(nodeId);
    const parentId = byId.get(nodeId)?.snapshot.parent_id;
    const result = parentId && byId.has(parentId) ? 1 + depth(parentId) : 0;
    visiting.delete(nodeId);
    depthById.set(nodeId, result);
    return result;
  };
  records.sort((left, right) => depth(right.object_id) - depth(left.object_id));
  for (const record of records) {
    await applyRemoteNodeTombstone(port, record);
  }
  return records.map((record) => record.object_id);
}
