import type { DbPort } from './dbPort.js';
import type { SyncPackNodeVersionParentRow } from './syncPackNodeVersions.js';

interface VersionIdentity {
  object_id: string;
  version_id: string;
}

export async function validateStoredVersionDependencies(
  port: DbPort,
  incoming: VersionIdentity[],
  parents: SyncPackNodeVersionParentRow[]
) {
  const byId = new Map(incoming.map((row) => [row.version_id, row]));
  for (const edge of parents) {
    const child = byId.get(edge.version_id);
    if (!child) throw new Error(`sync_pack_node_version_missing:${edge.version_id}`);
    if (byId.has(edge.parent_version_id)) continue;
    const [held] = await port.query<{
      object_id: string;
      has_body: number;
    }>(`SELECT object_id,
      CASE WHEN body_text IS NOT NULL OR json_type(snapshot_json, '$.content') = 'text'
        OR json_type(snapshot_json, '$.content') IS NULL THEN 1 ELSE 0 END AS has_body
      FROM main.node_sync_versions WHERE version_id = ?`, [edge.parent_version_id]);
    if (!held || held.has_body !== 1) {
      throw new Error(`sync_pack_node_version_missing_parent:${edge.version_id}`);
    }
    if (held.object_id !== child.object_id) {
      throw new Error(`sync_pack_node_version_cross_object:${edge.version_id}`);
    }
  }
  for (const edge of parents) {
    const [conflict] = await port.query<{ parent_version_id: string }>(
      `SELECT parent_version_id FROM main.node_sync_version_parents
       WHERE version_id = ? AND
         ((ordinal = ? AND parent_version_id <> ?)
          OR (parent_version_id = ? AND ordinal <> ?)) LIMIT 1`,
      [edge.version_id, edge.ordinal, edge.parent_version_id,
        edge.parent_version_id, edge.ordinal]
    );
    if (conflict) throw new Error(`sync_pack_node_version_parent_mismatch:${edge.version_id}`);
  }
}

export async function assertCurrentVersionAvailable(
  port: DbPort,
  nodeId: string,
  versionId: string
) {
  const [held] = await port.query<{ object_id: string; has_body: number }>(
    `SELECT object_id,
      CASE WHEN body_text IS NOT NULL OR json_type(snapshot_json, '$.content') = 'text'
        OR json_type(snapshot_json, '$.content') IS NULL THEN 1 ELSE 0 END AS has_body
     FROM main.node_sync_versions WHERE version_id = ?`, [versionId]
  );
  if (!held || held.has_body !== 1) {
    throw new Error(`sync_pack_node_current_version_missing:${nodeId}`);
  }
  if (held.object_id !== nodeId) {
    throw new Error(`sync_pack_node_current_version_cross_object:${nodeId}`);
  }
}
