import type { DbPort } from './dbPort.js';

/** A read view owned by one merge, discarded before its writes. */
export interface SyncNodeAncestorGraph {
  parents: Map<string, string[]>;
  metadata: Map<string, AncestorMetadata | null>;
}

export interface AncestorMetadata {
  version_id: string;
  parent_id: string | null;
  deleted_at: string | null;
  selection_id: string;
  alternatives: string | null;
}

export async function loadSyncNodeAncestorGraph(db: DbPort, roots: readonly string[]): Promise<SyncNodeAncestorGraph> {
  const parents = new Map<string, string[]>();
  const ids = [...new Set(roots)];
  for (let offset = 0; offset < ids.length; offset += 400) {
    const chunk = ids.slice(offset, offset + 400);
    const rows = await db.query<{ version_id: string; parent_version_id: string | null }>(`
      WITH RECURSIVE ancestors(version_id) AS (
        VALUES ${chunk.map(() => '(?)').join(',')}
        UNION
        SELECT edge.parent_version_id FROM ancestors a
          JOIN node_sync_version_parents edge ON edge.version_id = a.version_id
        UNION
        SELECT v.parent_version_id FROM ancestors a JOIN node_sync_versions v ON v.version_id = a.version_id
          WHERE v.parent_version_id IS NOT NULL AND v.parent_version_id <> '' AND NOT EXISTS (
            SELECT 1 FROM node_sync_version_parents edge WHERE edge.version_id = a.version_id)
        UNION
        SELECT t.parent_version_id FROM ancestors a JOIN node_sync_tombstones t ON t.rowid = (
            SELECT rowid FROM node_sync_tombstones WHERE version_id = a.version_id LIMIT 1)
          WHERE t.parent_version_id IS NOT NULL AND t.parent_version_id <> '' AND NOT EXISTS (
            SELECT 1 FROM node_sync_version_parents edge WHERE edge.version_id = a.version_id)
          AND NOT EXISTS (SELECT 1 FROM node_sync_versions v WHERE v.version_id = a.version_id)
      )
      SELECT a.version_id, CASE WHEN edge.version_id IS NOT NULL THEN edge.parent_version_id
        WHEN v.version_id IS NOT NULL THEN NULLIF(v.parent_version_id, '') ELSE NULLIF(t.parent_version_id, '') END AS parent_version_id
      FROM ancestors a
      LEFT JOIN node_sync_version_parents edge ON edge.version_id = a.version_id
      LEFT JOIN node_sync_versions v ON v.version_id = a.version_id
      LEFT JOIN node_sync_tombstones t ON t.rowid = (
            SELECT rowid FROM node_sync_tombstones WHERE version_id = a.version_id LIMIT 1)
      ORDER BY a.version_id, edge.ordinal`, chunk);
    const loaded = new Map<string, string[]>();
    for (const row of rows) {
      const list = loaded.get(row.version_id) ?? [];
      if (row.parent_version_id !== null) list.push(row.parent_version_id);
      loaded.set(row.version_id, list);
    }
    for (const [id, list] of loaded) parents.set(id, list);
  }
  return { parents, metadata: new Map() };
}

export async function loadAncestorMetadata(db: DbPort, ids: readonly string[], graph: SyncNodeAncestorGraph) {
  const missing = [...new Set(ids)].filter(id => !graph.metadata.has(id));
  for (let offset = 0; offset < missing.length; offset += 400) {
    const chunk = missing.slice(offset, offset + 400);
    const rows = await db.query<AncestorMetadata & Record<string, unknown>>(`SELECT version_id,
      json_extract(snapshot_json, '$.parent_id') AS parent_id,
      json_extract(snapshot_json, '$.deleted_at') AS deleted_at,
      COALESCE(json_extract(snapshot_json, '$.text_selection.version_id'), version_id) AS selection_id,
      json_extract(snapshot_json, '$.text_alternatives') AS alternatives
      FROM node_sync_versions WHERE version_id IN (${chunk.map(() => '?').join(',')})`, chunk);
    for (const id of chunk) graph.metadata.set(id, null);
    for (const row of rows) graph.metadata.set(row.version_id, row);
  }
  return ids.flatMap(id => {
    const row = graph.metadata.get(id);
    return row ? [row] : [];
  });
}
