import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort, DbRow } from './dbPort.js';

export interface StoredSyncNodeVersionRow extends DbRow {
  body_text: string | null;
  content_hash: string;
  created_at: string;
  host_name: string;
  object_id: string;
  snapshot_json: string;
  version_id: string;
}

export function storedSyncNodeVersionBody(row: StoredSyncNodeVersionRow): string | null {
  if (row.body_text !== null) return row.body_text;
  const snapshot = JSON.parse(row.snapshot_json) as { content?: unknown };
  return typeof snapshot?.content === 'string' ? snapshot.content : null;
}

export async function loadCurrentSyncNodeRecord(
  port: DbPort,
  objectId: string,
  includeAncestors = true
): Promise<NativeSyncNodeRecord | null> {
  const [row] = await port.query<StoredSyncNodeVersionRow>(
    `SELECT v.* FROM nodes n
     JOIN node_sync_versions v ON v.version_id = n.current_version_id
     WHERE n.id = ? LIMIT 1`,
    [objectId]
  );
  return row ? storedVersionToRecord(port, row, includeAncestors) : null;
}

export async function loadStoredSyncNodeVersionRecord(
  port: DbPort,
  versionId: string,
  includeAncestors = true
): Promise<NativeSyncNodeRecord | null> {
  const [row] = await port.query<StoredSyncNodeVersionRow>(
    'SELECT * FROM node_sync_versions WHERE version_id = ? LIMIT 1',
    [versionId]
  );
  return row ? storedVersionToRecord(port, row, includeAncestors) : null;
}

export async function isStoredVersionIdentical(port: DbPort, record: NativeSyncNodeRecord) {
  if (!record.version_id) return false;
  const [row] = await port.query<{ content_hash: string; object_id: string }>(
    'SELECT object_id, content_hash FROM node_sync_versions WHERE version_id = ? LIMIT 1',
    [record.version_id]
  );
  return row?.object_id === record.object_id && row.content_hash === record.content_hash;
}

export async function loadMergeBase(port: DbPort, leftId: string, rightId: string) {
  const parents = new Map<string, string[]>();
  const [left, right] = await Promise.all([
    loadAncestorDistances(port, leftId, parents),
    loadAncestorDistances(port, rightId, parents)
  ]);
  const common = [...left.keys()].filter((id) => right.has(id));
  const maximal = new Set(common);
  const visited = new Set<string>();
  for (const candidate of common) {
    if (!maximal.has(candidate)) continue;
    const pending = [...await cachedParents(port, candidate, parents)];
    while (pending.length) {
      const ancestor = pending.pop()!;
      if (visited.has(ancestor)) continue;
      visited.add(ancestor);
      maximal.delete(ancestor);
      pending.push(...await cachedParents(port, ancestor, parents));
    }
  }
  if (maximal.size > 1) throw new Error('sync_node_merge_base_ambiguous');
  const nearest = maximal.values().next().value;
  if (!nearest) return null;
  const [row] = await port.query<StoredSyncNodeVersionRow>(
    'SELECT * FROM node_sync_versions WHERE version_id = ? LIMIT 1',
    [nearest]
  );
  return row ?? null;
}

export async function isStoredAncestorVersion(port: DbPort, ancestorId: string, currentId: string) {
  return (await loadAncestorDistances(port, currentId)).has(ancestorId);
}

async function storedVersionToRecord(
  port: DbPort,
  row: StoredSyncNodeVersionRow,
  includeAncestors: boolean
): Promise<NativeSyncNodeRecord> {
  const snapshot = JSON.parse(row.snapshot_json) as NativeSyncNodeRecord['snapshot'];
  const body = storedSyncNodeVersionBody(row);
  if (body === null) throw new Error(`sync_node_version_body_unavailable:${row.version_id}`);
  const parents = await loadParents(port, row.version_id);
  return {
    ancestor_version_ids: includeAncestors ? await loadAncestors(port, row.version_id) : [],
    body_text: body,
    content_hash: row.content_hash,
    host_name: row.host_name,
    object_id: row.object_id,
    object_type: 'node',
    parent_version_id: parents[0] ?? null,
    parent_version_ids: parents,
    snapshot,
    updated_at: snapshot.updated_at,
    version_created_at: row.created_at,
    version_id: row.version_id
  };
}

async function loadParents(port: DbPort, versionId: string) {
  const rows = await port.query<{ parent_version_id: string }>(
    `SELECT parent_version_id FROM node_sync_version_parents
     WHERE version_id = ? ORDER BY ordinal ASC`,
    [versionId]
  );
  if (rows.length > 0) return rows.map((row) => row.parent_version_id);
  const [legacy] = await port.query<{ parent_version_id: string | null }>(
    'SELECT parent_version_id FROM node_sync_versions WHERE version_id = ? LIMIT 1',
    [versionId]
  );
  return legacy?.parent_version_id ? [legacy.parent_version_id] : [];
}

async function loadAncestors(port: DbPort, versionId: string) {
  return [...(await loadAncestorDistances(port, versionId)).keys()].filter((id) => id !== versionId);
}

async function loadAncestorDistances(
  port: DbPort,
  versionId: string,
  parents = new Map<string, string[]>()
) {
  const distances = new Map<string, number>([[versionId, 0]]);
  const pending: Array<{ distance: number; id: string }> = [{ distance: 0, id: versionId }];
  while (pending.length > 0) {
    const current = pending.shift()!;
    for (const parentId of await cachedParents(port, current.id, parents)) {
      const distance = current.distance + 1;
      if ((distances.get(parentId) ?? Number.POSITIVE_INFINITY) <= distance) continue;
      distances.set(parentId, distance);
      pending.push({ distance, id: parentId });
    }
  }
  return distances;
}

async function cachedParents(port: DbPort, versionId: string, cache: Map<string, string[]>) {
  const stored = cache.get(versionId);
  if (stored) return stored;
  const parents = await loadParents(port, versionId);
  cache.set(versionId, parents);
  return parents;
}
