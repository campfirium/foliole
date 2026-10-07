import type { DbPort } from './dbPort.js';

export async function loadSyncNodeVersionParents(port: DbPort, versionId: string) {
  const rows = await port.query<{ parent_version_id: string }>(
    `SELECT parent_version_id FROM node_sync_version_parents
     WHERE version_id = ? ORDER BY ordinal ASC`, [versionId]);
  if (rows.length > 0) return rows.map((row) => row.parent_version_id);
  const [legacy] = await port.query<{ parent_version_id: string | null }>(
    'SELECT parent_version_id FROM node_sync_versions WHERE version_id = ? LIMIT 1', [versionId]);
  return legacy?.parent_version_id ? [legacy.parent_version_id] : [];
}

export async function loadSyncNodeVersionAncestors(port: DbPort, versionId: string) {
  return [...(await loadAncestorDistances(port, versionId)).keys()].filter((id) => id !== versionId);
}

export async function loadAncestorDistances(port: DbPort, versionId: string, parents = new Map<string, string[]>()) {
  const distances = new Map<string, number>([[versionId, 0]]);
  const pending: Array<{ distance: number; id: string }> = [{ distance: 0, id: versionId }];
  while (pending.length > 0) {
    const current = pending.shift()!;
    for (const parentId of await cachedSyncNodeParents(port, current.id, parents)) {
      const distance = current.distance + 1;
      if ((distances.get(parentId) ?? Number.POSITIVE_INFINITY) <= distance) continue;
      distances.set(parentId, distance);
      pending.push({ distance, id: parentId });
    }
  }
  return distances;
}

export async function cachedSyncNodeParents(port: DbPort, versionId: string, cache: Map<string, string[]>) {
  const stored = cache.get(versionId);
  if (stored) return stored;
  const parents = await loadSyncNodeVersionParents(port, versionId);
  cache.set(versionId, parents);
  return parents;
}
