import { isEpubGeneratedNodeId } from '../../lib/core/import/epubGeneratedNodeIdentity.js';
import { openDatabaseConnection } from '../database/connection.js';

import { isManualItem } from './mirrorManualItemScope.js';

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
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const row of rows) {
    if (isManualItem({ kind: row.kind, anchorLink: row.anchor_link, parentNodeId: row.parent_id },
      byId.get(row.parent_id ?? '')?.kind)) return row.id;
    if (row.deleted_at && row.kind !== 'topic' && !row.anchor_link) {
      return ownerId;
    }
    if (row.kind === 'topic' && !row.anchor_link) {
      ownerId = row.id;
      // Generated book structure keeps its existing aggregate notification.
      if (!isEpubGeneratedNodeId(row.id)) return ownerId;
    }
    if (row.deleted_at && !row.anchor_link && !(row.kind === 'topic' && isEpubGeneratedNodeId(row.id))) {
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
     SELECT id FROM descendants WHERE id <> ? AND kind IN ('topic', 'item') AND anchor_link IS NULL`
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

// One read of every moved subtree plus the ancestors of its roots, so the capture does not grow per descendant.
const SUBTREES_WITH_ANCESTORS_SQL = `WITH RECURSIVE subtree(id) AS (
    SELECT id FROM nodes WHERE id IN (SELECT value FROM json_each(?))
    UNION SELECT n.id FROM nodes n JOIN subtree s ON n.parent_id = s.id
  ), ancestors(id) AS (
    SELECT parent_id FROM nodes WHERE id IN (SELECT value FROM json_each(?)) AND parent_id IS NOT NULL
    UNION SELECT n.parent_id FROM nodes n JOIN ancestors a ON n.id = a.id WHERE n.parent_id IS NOT NULL
  )
  SELECT n.id, n.parent_id, n.kind, n.anchor_link, n.deleted_at, n.id IN (SELECT id FROM subtree) AS in_subtree
  FROM nodes n WHERE n.id IN (SELECT id FROM subtree UNION SELECT id FROM ancestors)`;

function folderArticleIds(folderId: string, children: Map<string, MirrorNodeRow[]>) {
  const articleIds: string[] = [];
  const pending = [...children.get(folderId) ?? []];
  for (let row = pending.pop(); row; row = pending.pop()) {
    if ((row.kind === 'topic' || row.kind === 'item') && !row.anchor_link) articleIds.push(row.id);
    pending.push(...children.get(row.id) ?? []);
  }
  return articleIds;
}

function ancestorChain(row: MirrorNodeRow, byId: Map<string, MirrorNodeRow>) {
  const chain: MirrorNodeRow[] = [];
  const seen = new Set<string>();
  for (let next: MirrorNodeRow | undefined = row; next && !seen.has(next.id); next = byId.get(next.parent_id ?? '')) {
    seen.add(next.id);
    chain.push(next);
  }
  return chain;
}

/**
 * The article ids `resolveArticleIdsFromNodeId` gives for every node in the subtrees of `rootIds`, read in one
 * statement however large or deep the subtrees are.
 */
export function resolveArticleIdsForSubtrees(rootIds: readonly string[]): Set<string> {
  const articleIds = new Set<string>();
  if (!rootIds.length) return articleIds;
  const roots = JSON.stringify(rootIds);
  const rows = openDatabaseConnection().sqlite.prepare(SUBTREES_WITH_ANCESTORS_SQL)
    .all(roots, roots) as Array<MirrorNodeRow & { in_subtree: number }>;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const children = new Map<string, MirrorNodeRow[]>();
  for (const row of rows) {
    if (row.parent_id === null) continue;
    const siblings = children.get(row.parent_id);
    if (siblings) siblings.push(row);
    else children.set(row.parent_id, [row]);
  }
  for (const row of rows) {
    if (!row.in_subtree) continue;
    if (row.kind === 'folder') {
      for (const articleId of folderArticleIds(row.id, children)) articleIds.add(articleId);
      continue;
    }
    const ownerId = resolveOwnerFromChain(ancestorChain(row, byId));
    if (ownerId) articleIds.add(ownerId);
  }
  return articleIds;
}

export function resolveArticleIdFromNodeId(nodeId: string): string | null {
  return resolveArticleIdsFromNodeId(nodeId)[0] ?? null;
}
