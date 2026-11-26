import { loadScopedChildOrders } from '../../lib/core/database/parentChildOrder.js';
import {
  buildWorkspaceSnapshotMetadata,
  type WorkspaceNodeRowShape,
  type WorkspaceNodeSnapshot
} from '../../lib/core/database/workspaceSnapshotHelpers.js';
import { openDatabaseConnection } from '../database/connection.js';

export const MIRROR_INBOX_NODE_ID = 'special-inbox';
const MAX_CHAIN_DEPTH = 4096;

// The same node fields and effective anchor rule as the workspace snapshot, without bodies or learning state.
const NODE_COLUMNS = `n.rowid AS row_order, n.id, n.current_version_id, n.parent_id, n.kind, n.priority,
  n.enforce_priority, n.desired_retention, n.enable_short_term, n.sequential_reading_enabled, n.shelved_at,
  n.initial_review_due, n.manual_child_order, n.title, n.is_title_manual, n.hide_title_heading, n.body_blob_hash,
  n.opening_text, n.virtual_filter, '' AS content, NULL AS reveal,
  CASE WHEN n.anchor_resolution_status LIKE 'unmapped_%' THEN NULL ELSE n.anchor_link END AS anchor_link,
  n.image_regions, n.image_sources, n.resource_references, n.import_content_fingerprint,
  n.import_source_fingerprint, n.created_at, n.updated_at, n.deleted_at`;

type ScopedNodeRow = Omit<WorkspaceNodeRowShape, `reading_${string}` | `review_${string}`> & { row_order: number };

export interface ScopedMirrorNode {
  node: WorkspaceNodeSnapshot;
  rowOrder: number;
  trashed: boolean;
}

function toScopedNode(row: ScopedNodeRow): ScopedMirrorNode {
  return {
    node: { ...buildWorkspaceSnapshotMetadata(row), reading: null, review: null },
    rowOrder: row.row_order,
    // The full snapshot treats any truthy deletion stamp as trashed.
    trashed: Boolean(row.deleted_at)
  };
}

function queryNodes(sql: string, params: unknown[]) {
  return openDatabaseConnection().driver.queryAll<ScopedNodeRow>(sql, params as never).map(toScopedNode);
}

/** The node and every ancestor up to the root, nearest first; null when a parent row is missing or the chain loops. */
export function loadMirrorAncestorChain(nodeId: string) {
  const chain = queryNodes(`WITH RECURSIVE chain(id, depth) AS (
      SELECT ?, 0
      UNION ALL
      SELECT n.parent_id, chain.depth + 1 FROM chain JOIN nodes n ON n.id = chain.id
      WHERE n.parent_id IS NOT NULL AND chain.depth < ${MAX_CHAIN_DEPTH})
    SELECT ${NODE_COLUMNS} FROM chain JOIN nodes n ON n.id = chain.id ORDER BY chain.depth`, [nodeId]);
  const top = chain.at(-1);
  if (!top || chain[0]!.node.id !== nodeId || top.node.parentNodeId !== null) return null;
  return chain;
}

/** True when any folder sits below a non-folder, which would let a folder name a directory found only by a walk. */
export function hasFolderBelowNonFolder() {
  return Boolean(openDatabaseConnection().driver.queryOne(`SELECT 1 AS found FROM nodes f
    JOIN nodes p ON p.id = f.parent_id
    WHERE f.kind = 'folder' AND p.kind IS NOT 'folder' LIMIT 1`));
}

/** Folders directly inside the given parents; `null` is the library root. */
export function loadMirrorChildFolders(parentIds: Array<string | null>) {
  const ids = parentIds.filter((id): id is string => id !== null);
  const root = parentIds.includes(null) ? ' OR n.parent_id IS NULL' : '';
  return queryNodes(`SELECT ${NODE_COLUMNS} FROM nodes n
    WHERE n.kind = 'folder' AND (n.parent_id IN (SELECT value FROM json_each(?))${root})`, [JSON.stringify(ids)]);
}

/**
 * Every node whose nearest folder-or-root container is `anchorId` (`null` is the root), with the folders directly
 * inside it. The walk does not enter folders or the Inbox, whose contents belong to other mirror directories.
 */
export function loadMirrorDirectoryMembers(anchorId: string | null) {
  return queryNodes(`WITH RECURSIVE walk(id) AS (
      SELECT id FROM nodes WHERE parent_id IS ?
      UNION ALL
      SELECT c.id FROM walk JOIN nodes p ON p.id = walk.id JOIN nodes c ON c.parent_id = walk.id
      WHERE p.kind IS NOT 'folder' AND p.id <> '${MIRROR_INBOX_NODE_ID}')
    SELECT ${NODE_COLUMNS} FROM walk JOIN nodes n ON n.id = walk.id ORDER BY n.rowid`, [anchorId]);
}

/** The given nodes with the same fields the scoped planner reads, so revisions compare across recaptures. */
export function loadMirrorNodesByIds(nodeIds: string[]) {
  return queryNodes(`SELECT ${NODE_COLUMNS} FROM nodes n WHERE n.id IN (SELECT value FROM json_each(?))`, [JSON.stringify(nodeIds)]);
}

/** Child order of each parent as the whole-workspace traversal gives it. */
export function loadMirrorChildOrders(parentIds: Array<string | null>) {
  return new Map(loadScopedChildOrders(openDatabaseConnection().driver, parentIds)
    .map(({ parentNodeId, childIds }) => [parentNodeId, childIds]));
}
