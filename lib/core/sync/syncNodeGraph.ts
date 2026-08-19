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

export async function loadCurrentSyncNodeRecord(
  port: DbPort,
  objectId: string
): Promise<NativeSyncNodeRecord | null> {
  const [row] = await port.query<StoredSyncNodeVersionRow>(
    `SELECT v.* FROM nodes n
     JOIN node_sync_versions v ON v.version_id = n.current_version_id
     WHERE n.id = ? LIMIT 1`,
    [objectId]
  );
  return row ? storedVersionToRecord(port, row) : null;
}

export async function loadStoredSyncNodeVersionRecord(
  port: DbPort,
  versionId: string
): Promise<NativeSyncNodeRecord | null> {
  const [row] = await port.query<StoredSyncNodeVersionRow>(
    'SELECT * FROM node_sync_versions WHERE version_id = ? LIMIT 1',
    [versionId]
  );
  return row ? storedVersionToRecord(port, row) : null;
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
  const [left, right] = await Promise.all([
    loadAncestorDistances(port, leftId),
    loadAncestorDistances(port, rightId)
  ]);
  const nearest = [...left.keys()].filter((id) => right.has(id)).sort((a, b) => {
    const leftA = left.get(a)!;
    const rightA = right.get(a)!;
    const leftB = left.get(b)!;
    const rightB = right.get(b)!;
    return Math.max(leftA, rightA) - Math.max(leftB, rightB)
      || leftA + rightA - leftB - rightB
      || a.localeCompare(b);
  })[0];
  if (!nearest) return null;
  const [row] = await port.query<StoredSyncNodeVersionRow>(
    'SELECT * FROM node_sync_versions WHERE version_id = ? LIMIT 1',
    [nearest]
  );
  return row ?? null;
}

async function storedVersionToRecord(
  port: DbPort,
  row: StoredSyncNodeVersionRow
): Promise<NativeSyncNodeRecord> {
  const snapshot = JSON.parse(row.snapshot_json) as NativeSyncNodeRecord['snapshot'];
  const parents = await loadParents(port, row.version_id);
  return {
    ancestor_version_ids: await loadAncestors(port, row.version_id),
    body_text: row.body_text ?? snapshot.content ?? '',
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

async function loadAncestorDistances(port: DbPort, versionId: string) {
  const distances = new Map<string, number>([[versionId, 0]]);
  const pending: Array<{ distance: number; id: string }> = [{ distance: 0, id: versionId }];
  while (pending.length > 0) {
    const current = pending.shift()!;
    for (const parentId of await loadParents(port, current.id)) {
      const distance = current.distance + 1;
      if ((distances.get(parentId) ?? Number.POSITIVE_INFINITY) <= distance) continue;
      distances.set(parentId, distance);
      pending.push({ distance, id: parentId });
    }
  }
  return distances;
}
