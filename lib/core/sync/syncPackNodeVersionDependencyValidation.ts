import type { DbPort } from './dbPort.js';
import type { SyncPackNodeVersionParentRow } from './syncPackNodeVersions.js';

interface VersionIdentity {
  object_id: string;
  parent_version_id: string | null;
  version_id: string;
}

export function includeLegacyVersionParents(
  incoming: VersionIdentity[],
  parents: SyncPackNodeVersionParentRow[]
) {
  const explicit = new Set(parents.map((row) => row.version_id));
  return [...parents, ...incoming.filter((row) => row.parent_version_id &&
    !explicit.has(row.version_id)).map((row) => ({
    version_id: row.version_id,
    parent_version_id: row.parent_version_id!,
    ordinal: 0
  }))];
}

export async function validateStoredVersionDependencies(
  port: DbPort,
  incoming: VersionIdentity[],
  parents: SyncPackNodeVersionParentRow[]
) {
  const byId = new Map(incoming.map((row) => [row.version_id, row]));
  for (const edge of parents) {
    const child = byId.get(edge.version_id) ?? await heldVersion(port, edge.version_id);
    if (!child) throw new Error(`sync_pack_node_version_missing:${edge.version_id}`);
    const parent = byId.get(edge.parent_version_id) ?? await heldVersion(port, edge.parent_version_id);
    // Retention releases historical bodies, not the identities used by causal edges.
    if (!parent) {
      throw new Error(`sync_pack_node_version_missing_parent:${edge.version_id}`);
    }
    if (parent.object_id !== child.object_id) {
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

function heldVersion(port: DbPort, versionId: string) {
  return port.query<{ object_id: string; has_body: number }>(
    `SELECT object_id,
      CASE WHEN body_text IS NOT NULL OR json_type(snapshot_json, '$.content') = 'text'
        OR json_type(snapshot_json, '$.content') IS NULL THEN 1 ELSE 0 END AS has_body
      FROM main.node_sync_versions WHERE version_id = ?`, [versionId]
  ).then((rows) => rows[0]);
}

export async function assertCurrentVersionAvailable(
  port: DbPort,
  nodeId: string,
  versionId: string
) {
  const held = await heldVersion(port, versionId);
  if (!held || held.has_body !== 1) {
    throw new Error(`sync_pack_node_current_version_missing:${nodeId}`);
  }
  if (held.object_id !== nodeId) {
    throw new Error(`sync_pack_node_current_version_cross_object:${nodeId}`);
  }
}
