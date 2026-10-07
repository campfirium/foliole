import type { DbPort } from './dbPort.js';
import { matchingTombstoneVersionSql } from './syncNodeTombstoneVersion.js';
import { loadVerifiedSyncNodeVersion, storedVerifiedVersionToNode,
  type StoredVerifiedSyncNode, type StoredVerifiedVersionRow } from './syncNodeVerifiedGraph.js';

interface StoredTombstone extends StoredVerifiedVersionRow {
  parent_version_id: string | null;
}

async function loadVerifiedTombstone(db: DbPort, versionId: string) {
  const [row] = await db.query<StoredTombstone>(`SELECT tomb.version_id, tomb.node_id AS object_id,
    tomb.parent_version_id, tomb.host_name, tomb.created_at, tomb.content_hash,
    json_remove(tomb.snapshot_json, '$.content') AS snapshot_json, 1 AS is_tombstone,
    COALESCE(version.body_state, 'retired') AS body_state, version.body_blob_hash
    FROM node_sync_tombstones tomb LEFT JOIN node_sync_versions version
      ON ${matchingTombstoneVersionSql('version', 'tomb', 'chunked')}
    WHERE tomb.version_id = ?`, [versionId]);
  if (!row) return null;
  const edges = await db.query<{ parent_version_id: string }>(
    'SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = ? ORDER BY ordinal', [versionId]);
  const parents = edges.length ? edges.map((edge) => edge.parent_version_id)
    : row.parent_version_id ? [row.parent_version_id] : [];
  return storedVerifiedVersionToNode(db, row, false, parents);
}

/** Batch facts preserve tombstone precedence and original lineage, without loading any body bytes. */
export async function loadRetainedVerifiedSyncNodeVersions(db: DbPort, versionIds: readonly string[]) {
  const records = new Map<string, StoredVerifiedSyncNode>();
  for (const versionId of new Set(versionIds)) {
    const version = await loadVerifiedSyncNodeVersion(db, versionId, false);
    const record = await loadVerifiedTombstone(db, versionId) ?? version;
    if (!record) continue;
    if (!record.metadata.is_tombstone && record.body.kind !== 'readable') {
      const [protectedHead] = await db.query(`SELECT 1 FROM nodes WHERE current_version_id = ?
        UNION SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM node_sync_version_parents WHERE parent_version_id = ?)
          AND NOT EXISTS (SELECT 1 FROM node_sync_versions WHERE parent_version_id = ?)`,
      [versionId, versionId, versionId]);
      if (protectedHead) throw new Error(`sync_node_version_body_unavailable:${versionId}`);
    }
    records.set(versionId, record);
  }
  return records;
}
