import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort } from './dbPort.js';
import { syncNodeAncestorEdgesCte } from './syncNodeAncestorGraph.js';
import { storedVersionToRecord, type StoredSyncNodeVersionRow } from './syncNodeGraph.js';
import { matchingTombstoneVersionSql } from './syncNodeTombstoneVersion.js';

// Version records read in one statement each: the rows carry their ancestor graph, so building a record's parents
// and ancestors issues no further statements. On the phone every statement is a bridge round trip.

/**
 * `loadCurrentSyncNodeRecord` for several nodes in one read: the current version rows come with the ancestor graph
 * of all of them, so building the records' parents and ancestors issues no further statements. Nodes without a
 * stored current version are absent from the result.
 */
export async function loadCurrentSyncNodeRecordsInOneRead(port: DbPort, objectIds: readonly string[]) {
  const records = new Map<string, NativeSyncNodeRecord>();
  if (!objectIds.length) return records;
  const ids = JSON.stringify([...new Set(objectIds)]);
  const rows = await port.query<StoredSyncNodeVersionRow & { node_id: string | null; lineage: string | null }>(
    `${syncNodeAncestorEdgesCte(`SELECT current_version_id FROM nodes
       WHERE id IN (SELECT value FROM json_each(?)) AND current_version_id IS NOT NULL`)}
     SELECT n.id AS node_id, v.version_id, v.object_id, v.parent_version_id, v.host_name, v.created_at, v.content_hash,
       v.body_text, v.snapshot_json, NULL AS lineage
     FROM nodes n JOIN node_sync_versions v ON v.version_id = n.current_version_id
     WHERE n.id IN (SELECT value FROM json_each(?))
     UNION ALL SELECT NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
       (SELECT json_group_array(json_array(version_id, parent_version_id, ordinal)) FROM ancestor_edges)`,
    [ids, ids]
  );
  const lineage = lineageMap(rows.find(row => row.node_id === null)?.lineage);
  for (const row of rows) {
    if (row.node_id === null) continue;
    records.set(row.node_id, await storedVersionToRecord(port, row, true, lineage.get(row.version_id) ?? [], true, lineage));
  }
  return records;
}

/**
 * `loadRetainedSyncNodeVersionFact` with its ancestors in one read: the fact row carries its ancestor graph, so the
 * record's parents and ancestors issue no further statements.
 */
export async function loadRetainedSyncNodeVersionFactInOneRead(port: DbPort, versionId: string) {
  const [row] = await port.query<StoredSyncNodeVersionRow & { lineage: string }>(
    `${syncNodeAncestorEdgesCte('VALUES (?)')}, fact AS (
      SELECT tomb.version_id, tomb.node_id AS object_id, tomb.parent_version_id, tomb.host_name, tomb.created_at,
        tomb.content_hash, version.body_text, tomb.snapshot_json, 1 AS is_tombstone
        FROM node_sync_tombstones tomb LEFT JOIN node_sync_versions version
          ON ${matchingTombstoneVersionSql('version', 'tomb')} WHERE tomb.version_id = ?
        UNION ALL SELECT version_id, object_id, parent_version_id, host_name, created_at,
          content_hash, body_text, snapshot_json, 0 AS is_tombstone
        FROM node_sync_versions WHERE version_id = ? LIMIT 1
    ) SELECT fact.*, (SELECT json_group_array(json_array(version_id, parent_version_id, ordinal)) FROM ancestor_edges) AS lineage
      FROM fact`, [versionId, versionId, versionId]);
  if (!row) return null;
  const lineage = lineageMap(row.lineage);
  return storedVersionToRecord(port, row, true, lineage.get(row.version_id) ?? [], false, lineage);
}

function lineageMap(json: string | null | undefined) {
  const edges = (JSON.parse(json ?? '[]') as [string, string | null, number | null][])
    .sort((left, right) => left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : (left[2] ?? 0) - (right[2] ?? 0));
  const lineage = new Map<string, string[]>();
  for (const [versionId, parentId] of edges) {
    const list = lineage.get(versionId) ?? [];
    if (parentId !== null) list.push(parentId);
    lineage.set(versionId, list);
  }
  return lineage;
}

