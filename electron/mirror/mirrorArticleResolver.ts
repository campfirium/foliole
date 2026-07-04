import { openDatabaseConnection } from '../database/connection.js';

interface MirrorNodeRow {
  id: string;
  parent_id: string | null;
  kind: string;
  anchor_link: string | null;
  deleted_at: string | null;
}

function loadNodeRow(nodeId: string) {
  return openDatabaseConnection().sqlite.prepare(
    'SELECT id, parent_id, kind, anchor_link, deleted_at FROM nodes WHERE id = ?'
  ).get(nodeId) as MirrorNodeRow | undefined;
}

function resolveOwnerFromChain(rows: MirrorNodeRow[]) {
  let ownerId: string | null = null;
  for (const row of rows) {
    if (row.deleted_at && row.kind !== 'topic') {
      return ownerId;
    }
    if (row.kind === 'topic' && !row.anchor_link) {
      ownerId = row.id;
    }
    if (row.deleted_at) {
      return ownerId;
    }
  }
  return ownerId;
}

function loadNodeAncestorChain(nodeId: string) {
  return openDatabaseConnection().sqlite.prepare(
    `WITH RECURSIVE ancestors AS (
       SELECT id, parent_id, kind, anchor_link, deleted_at FROM nodes WHERE id = ?
       UNION ALL
       SELECT n.id, n.parent_id, n.kind, n.anchor_link, n.deleted_at
       FROM nodes n JOIN ancestors a ON n.id = a.parent_id
     )
     SELECT id, parent_id, kind, anchor_link, deleted_at FROM ancestors`
  ).all(nodeId) as MirrorNodeRow[];
}

function loadFolderArticleIds(folderId: string) {
  const rows = openDatabaseConnection().sqlite.prepare(
    `WITH RECURSIVE descendants AS (
       SELECT id, parent_id, kind, anchor_link FROM nodes WHERE id = ?
       UNION ALL
       SELECT n.id, n.parent_id, n.kind, n.anchor_link
       FROM nodes n JOIN descendants d ON n.parent_id = d.id
     )
     SELECT id FROM descendants WHERE id <> ? AND kind = 'topic' AND anchor_link IS NULL`
  ).all(folderId, folderId) as Array<{ id: string }>;
  return rows.map((row) => row.id);
}

export function resolveArticleIdsFromNodeId(nodeId: string): string[] {
  const row = loadNodeRow(nodeId);
  if (!row) {
    return [];
  }
  if (row.kind === 'folder') {
    return loadFolderArticleIds(row.id);
  }
  const ownerId = resolveOwnerFromChain(loadNodeAncestorChain(nodeId));
  return ownerId ? [ownerId] : [];
}

export function resolveArticleIdFromNodeId(nodeId: string): string | null {
  return resolveArticleIdsFromNodeId(nodeId)[0] ?? null;
}
