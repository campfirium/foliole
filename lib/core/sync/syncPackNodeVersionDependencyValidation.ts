import type { DbPort } from './dbPort.js';
import { isStoredAncestorVersion } from './syncNodeGraph.js';
import type { SyncPackNodeVersionParentRow } from './syncPackNodeVersions.js';
import { proveSyncPackResolutionFrontier } from './syncPackResolutionFrontierProof.js';

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
  parents: SyncPackNodeVersionParentRow[],
  incomingAlias?: string,
  convergedReplays: ReadonlySet<string> = new Set()
) {
  const byId = new Map(incoming.map((row) => [row.version_id, row]));
  const equivalentFrontiers = new Map<string, boolean>();
  await assertReturningParentOwners(port, byId);
  for (const edge of parents) {
    const child = byId.get(edge.version_id) ?? await heldVersion(port, edge.version_id);
    if (!child) throw new Error(`sync_pack_node_version_missing:${edge.version_id}`);
    const parent = byId.get(edge.parent_version_id) ?? await heldVersion(port, edge.parent_version_id);
    // Preserve historical gaps as references; only available identities prove ownership.
    if (parent && parent.object_id !== child.object_id) {
      throw new Error(`sync_pack_node_version_cross_object:${edge.version_id}`);
    }
  }
  for (const edge of parents) {
    const incomingChild = byId.get(edge.version_id);
    if (convergedReplays.has(edge.version_id)) continue;
    const [storedChild] = await port.query<{ parent_version_id: string | null }>(
      'SELECT parent_version_id FROM node_sync_versions WHERE version_id = ?', [edge.version_id]);
    // An existing contracted chain is kept as-is; incoming edges cannot expand it.
    if (storedChild && incomingChild && storedChild.parent_version_id !== incomingChild.parent_version_id) {
      if (!equivalentFrontiers.has(edge.version_id)) {
        equivalentFrontiers.set(edge.version_id, await provenContractedFrontiers(port, edge.version_id, parents) ||
          Boolean(incomingAlias && await proveSyncPackResolutionFrontier(port, edge.version_id, parents, incomingAlias)));
      }
      if (equivalentFrontiers.get(edge.version_id)) continue;
      if (!storedChild.parent_version_id || incomingChild.parent_version_id && (
        incomingAncestor(parents, storedChild.parent_version_id, incomingChild.parent_version_id) ||
        await isStoredAncestorVersion(port, storedChild.parent_version_id, incomingChild.parent_version_id))) continue;
      throw new Error(`sync_pack_node_version_parent_mismatch:${edge.version_id}`);
    }
    const [conflict] = await port.query<{ parent_version_id: string }>(
      `SELECT parent_version_id FROM main.node_sync_version_parents
       WHERE version_id = ? AND
         ((ordinal = ? AND parent_version_id <> ?)
          OR (parent_version_id = ? AND ordinal <> ?)) LIMIT 1`,
      [edge.version_id, edge.ordinal, edge.parent_version_id,
        edge.parent_version_id, edge.ordinal]
    );
    const [sameRelation] = await port.query(
      'SELECT 1 FROM node_sync_version_parents WHERE version_id = ? AND parent_version_id = ?',
      [edge.version_id, edge.parent_version_id]);
    if (conflict && !sameRelation && !await isStoredAncestorVersion(port, edge.parent_version_id, edge.version_id)
        && !incomingAncestor(parents, conflict.parent_version_id, edge.parent_version_id)
        && !await provenContractedFrontiers(port, edge.version_id, parents)
        && !(incomingAlias && await proveSyncPackResolutionFrontier(port, edge.version_id, parents, incomingAlias))) {
      throw new Error(`sync_pack_node_version_parent_mismatch:${edge.version_id}`);
    }
  }
}

async function provenContractedFrontiers(port: DbPort, versionId: string, incoming: SyncPackNodeVersionParentRow[]) {
  const stored = await port.query<{ parent_version_id: string }>(
    'SELECT parent_version_id FROM node_sync_version_parents WHERE version_id = ?', [versionId]);
  const left = stored.map(row => row.parent_version_id);
  const right = incoming.filter(row => row.version_id === versionId).map(row => row.parent_version_id);
  if (!left.length || !right.length) return false;
  const comparable = async (first: string, second: string) => first === second ||
    incomingAncestor(incoming, first, second) || incomingAncestor(incoming, second, first) ||
    await isStoredAncestorVersion(port, first, second) || await isStoredAncestorVersion(port, second, first);
  for (const [frontier, other] of [[left, right], [right, left]]) {
    for (const parent of frontier!) {
      let covered = false;
      for (const candidate of other!) if (await comparable(parent, candidate)) { covered = true; break; }
      if (!covered) return false;
    }
  }
  return true;
}

async function assertReturningParentOwners(port: DbPort, incoming: Map<string, VersionIdentity>) {
  if (incoming.size === 0) return;
  const children = await port.query<{ version_id: string; object_id: string; parent_version_id: string }>(
    `WITH requested AS MATERIALIZED (
       SELECT value AS version_id FROM json_each(?) request WHERE NOT EXISTS (
         SELECT 1 FROM main.node_sync_versions held WHERE held.version_id = request.value))
     SELECT child.version_id, child.object_id, edge.parent_version_id
     FROM main.node_sync_version_parents edge
     JOIN main.node_sync_versions child ON child.version_id = edge.version_id
     WHERE edge.parent_version_id IN (SELECT version_id FROM requested)
     UNION ALL SELECT child.version_id, child.object_id, child.parent_version_id
     FROM main.node_sync_versions child
     WHERE child.parent_version_id IN (SELECT version_id FROM requested) AND NOT EXISTS (
       SELECT 1 FROM main.node_sync_version_parents edge WHERE edge.version_id = child.version_id)`,
    [JSON.stringify([...incoming.keys()])]
  );
  for (const child of children) {
    if (incoming.get(child.parent_version_id)?.object_id !== child.object_id) {
      throw new Error(`sync_pack_node_version_cross_object:${child.version_id}`);
    }
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

function incomingAncestor(edges: SyncPackNodeVersionParentRow[], ancestor: string, child: string) {
  const seen = new Set<string>();
  const pending = [child];
  while (pending.length) {
    const id = pending.pop()!;
    if (id === ancestor) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    pending.push(...edges.filter((edge) => edge.version_id === id).map((edge) => edge.parent_version_id));
  }
  return false;
}
