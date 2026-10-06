import type { NativeSyncNodeRecord } from '../../platform/nativeSyncContract.js';

import type { DbPort, DbRow } from './dbPort.js';
import { matchingTombstoneVersionSql } from './syncNodeTombstoneVersion.js';

export interface StoredSyncNodeVersionRow extends DbRow {
  body_text: string | null;
  content_hash: string;
  created_at: string;
  host_name: string;
  is_tombstone?: number;
  object_id: string;
  parent_version_id: string | null;
  snapshot_json: string;
  version_id: string;
}

export function storedSyncNodeVersionBody<T extends Pick<StoredSyncNodeVersionRow, 'body_text' | 'snapshot_json'>>(row: T): string | null {
  if (row.body_text !== null) return row.body_text;
  const snapshot = JSON.parse(row.snapshot_json) as { content?: unknown };
  if (snapshot?.content === null) return null;
  return typeof snapshot?.content === 'string' ? snapshot.content : '';
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

/** Retired bodies remain original version facts and cannot be used as current text. */
export async function loadRetainedSyncNodeVersionFact(port: DbPort, versionId: string) {
  const [row] = await port.query<StoredSyncNodeVersionRow>(
    'SELECT * FROM node_sync_versions WHERE version_id = ? LIMIT 1', [versionId]);
  return row ? storedVersionToRecord(port, row, true, undefined, false) : null;
}

export async function loadStoredSyncNodeVersionRecords(port: DbPort, versionIds: string[]) {
  return loadVersionRecords(port, versionIds, true);
}

export async function loadRetainedSyncNodeVersionRecords(port: DbPort, versionIds: string[]) {
  const records = await loadVersionRecords(port, versionIds, false);
  for (const record of records.values()) {
    if (record.body_text !== null) continue;
    const [protectedHead] = await port.query(
      `SELECT 1 FROM nodes WHERE current_version_id = ?
       UNION SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM node_sync_version_parents
         WHERE parent_version_id = ?) AND NOT EXISTS (SELECT 1 FROM node_sync_versions
         WHERE parent_version_id = ?)`, [record.version_id!, record.version_id!, record.version_id!]);
    if (protectedHead) throw new Error(`sync_node_version_body_unavailable:${record.version_id}`);
  }
  return records;
}

async function loadVersionRecords(port: DbPort, versionIds: string[], requireBody: boolean) {
  const uniqueIds = [...new Set(versionIds)];
  const records = new Map<string, NativeSyncNodeRecord>();
  if (uniqueIds.length === 0) return records;
  const placeholders = uniqueIds.map(() => '?').join(', ');
  const rows = await port.query<StoredSyncNodeVersionRow>(
    `SELECT version_id, object_id, parent_version_id, host_name, created_at,
      content_hash, body_text, snapshot_json, 0 AS is_tombstone
     FROM node_sync_versions WHERE version_id IN (${placeholders})
     UNION ALL
     SELECT tomb.version_id, tomb.node_id AS object_id, tomb.parent_version_id, tomb.host_name, tomb.created_at,
      tomb.content_hash, version.body_text, tomb.snapshot_json, 1 AS is_tombstone
     FROM node_sync_tombstones tomb LEFT JOIN node_sync_versions version
       ON ${matchingTombstoneVersionSql('version', 'tomb')}
     WHERE tomb.version_id IN (${placeholders})`, [...uniqueIds, ...uniqueIds]
  );
  const edges = await port.query<{ version_id: string; parent_version_id: string }>(
    `SELECT version_id, parent_version_id FROM node_sync_version_parents
     WHERE version_id IN (${placeholders}) ORDER BY version_id, ordinal`, uniqueIds
  );
  const parents = new Map<string, string[]>();
  for (const edge of edges) {
    const list = parents.get(edge.version_id) ?? [];
    list.push(edge.parent_version_id);
    parents.set(edge.version_id, list);
  }
  for (const row of rows) {
    const lineage = parents.get(row.version_id) ??
      (row.parent_version_id ? [row.parent_version_id] : []);
    records.set(row.version_id, await storedVersionToRecord(port, row, false, lineage, requireBody));
  }
  return records;
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
  const candidates = await loadMergeBaseCandidates(port, leftId, rightId);
  if (candidates.length > 1) throw new Error('sync_node_merge_base_ambiguous');
  const nearest = candidates[0];
  if (!nearest) return null;
  const [row] = await port.query<StoredSyncNodeVersionRow>(
    'SELECT * FROM node_sync_versions WHERE version_id = ? LIMIT 1',
    [nearest]
  );
  return row ?? null;
}

export async function loadMergeBaseCandidates(port: DbPort, leftId: string, rightId: string) {
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
  return [...maximal];
}

export async function isStoredAncestorVersion(port: DbPort, ancestorId: string, currentId: string) {
  return (await loadAncestorDistances(port, currentId)).has(ancestorId);
}

async function storedVersionToRecord(
  port: DbPort,
  row: StoredSyncNodeVersionRow,
  includeAncestors: boolean,
  knownParents?: string[],
  requireBody = true
): Promise<NativeSyncNodeRecord> {
  const snapshot = JSON.parse(row.snapshot_json) as NativeSyncNodeRecord['snapshot'];
  const isTombstone = row.is_tombstone === 1;
  const body = isTombstone ? row.body_text ?? '' : storedSyncNodeVersionBody(row);
  if (body === null && requireBody) throw new Error(`sync_node_version_body_unavailable:${row.version_id}`);
  const parents = knownParents ?? await loadParents(port, row.version_id);
  return {
    ancestor_version_ids: includeAncestors ? await loadAncestors(port, row.version_id) : [],
    body_text: body,
    content_hash: row.content_hash,
    host_name: row.host_name,
    is_tombstone: isTombstone,
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
