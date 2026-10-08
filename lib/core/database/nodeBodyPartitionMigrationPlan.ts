import { splitImportBody } from '../import/importBodySegments.js';
import { resolveNodeOpeningText } from '../nodes/nodeOpeningPreview.js';
import { TEXT_BODY_MAX_BYTES } from '../nodes/textBodyBudget.js';

import { fittingBodyPartAnchorIndex, protectedBodyPartAnchorSpans } from './bodyPartAnchorPlacement.js';
import { offsetBodyAnchor } from './bodyPartitionAnchors.js';
import { bodyPartNodeId, bodyPartPrefix } from './bodyPartitionIdentity.js';
import { DELETE_NODE_SEARCH_PENDING_SQL, INSERT_NODE_SEARCH_PENDING_SQL } from './searchPendingState.js';
import { hashTextBody } from './textBodyHash.js';
import { WORKSPACE_SEARCH_QUEUED_REVISION_KEY, WORKSPACE_SEARCH_SOURCE_REVISION_KEY } from './workspaceSearchSourceState.js';

export const PARTITION_SOURCE_SQL = 'SELECT id, title, image_sources, resource_references, deleted_at FROM nodes WHERE id = ?';
export const PARTITION_ANCHORS_SQL = `SELECT id, anchor_link FROM nodes
  WHERE parent_id = ? AND deleted_at IS NULL AND anchor_link IS NOT NULL`;
export const PARTITION_EXISTING_SQL = `SELECT id, content, title, parent_id, deleted_at FROM nodes WHERE id LIKE ? ORDER BY id`;
export type PartitionSource = { id: string; title: string; image_sources: string | null;
  resource_references: string; deleted_at: string | null };
export type PartitionAnchor = { id: string; anchor_link: string };
export type ExistingPartition = { id: string; content: string; title: string;
  parent_id: string | null; deleted_at: string | null };
type Statement = { sql: string; params: Array<string | number | null> };

function bodyStatement(id: string, title: string, content: string, now: string): Statement {
  return { sql: `UPDATE nodes SET content = ?, body_blob_hash = ?, opening_text = ?,
    updated_at = ?, sync_dirty = 1 WHERE id = ?`,
  params: [content, hashTextBody(content), resolveNodeOpeningText(content, title), now, id] };
}

function partStatements(node: PartitionSource, existing: ExistingPartition | undefined,
  content: string, index: number, now: string): Statement[] {
  const id = bodyPartNodeId(node.id, index);
  if (existing && (existing.parent_id !== node.id || existing.content !== content)) {
    throw new Error(`node_body_migration_partition_conflict:${id}`);
  }
  const title = existing?.title ?? `${node.title} (${index + 1})`;
  const insert: Statement = { sql: `INSERT INTO nodes
    (id, parent_id, kind, title, is_title_manual, content, body_blob_hash, opening_text,
      image_sources, resource_references, sync_dirty, created_at, updated_at, deleted_at)
    VALUES (?, ?, 'topic', ?, 1, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
  params: [id, node.id, title, content, hashTextBody(content), resolveNodeOpeningText(content, title),
    node.image_sources, node.resource_references, now, now, node.deleted_at] };
  return existing ? [bodyStatement(id, title, content, now), {
    sql: `UPDATE nodes SET deleted_at = ?, image_sources = ?, resource_references = ? WHERE id = ?`,
    params: [node.deleted_at, node.image_sources, node.resource_references, id]
  }] : [insert];
}

/** Schema conversion shares the import partition identities, boundaries and anchor semantics. */
export function planNodeBodyMigrationPartitions(input: {
  node: PartitionSource; text: string; anchors: PartitionAnchor[]; existing: ExistingPartition[];
  now: string; searchInvalidations: boolean;
}) {
  const { node, text, anchors, existing, now } = input;
  if (existing.some((row) => row.parent_id !== node.id)) {
    throw new Error(`node_body_migration_partition_conflict:${node.id}`);
  }
  const protectedRanges = protectedBodyPartAnchorSpans(text, anchors.map(anchor => anchor.anchor_link));
  const parts = splitImportBody(text, TEXT_BODY_MAX_BYTES, protectedRanges);
  const ids = parts.map((_, index) => bodyPartNodeId(node.id, index));
  const statements = parts.flatMap((part, index) => partStatements(node,
    existing.find((row) => row.id === ids[index]), part.content, index, now));
  const moved = ids.map((id) => ({ id, parentId: node.id }));
  for (const anchor of anchors) {
    const index = fittingBodyPartAnchorIndex(anchor.anchor_link, parts);
    const part = parts[index];
    const id = ids[index];
    if (!part || !id) continue;
    statements.push({ sql: `UPDATE nodes SET parent_id = ?, anchor_link = ?, updated_at = ?, sync_dirty = 1 WHERE id = ?`,
      params: [id, offsetBodyAnchor(anchor.anchor_link, -part.from), now, anchor.id] });
    moved.push({ id: anchor.id, parentId: id });
  }
  const retired = existing.filter((row) => row.deleted_at === null && !ids.includes(row.id));
  for (const row of retired) statements.push({ sql: `UPDATE nodes SET deleted_at = ?, updated_at = ?, sync_dirty = 1 WHERE id = ?`,
    params: [now, now, row.id] });
  statements.push(bodyStatement(node.id, node.title, '', now));
  const invalidated = input.searchInvalidations ? [node.id, ...ids,
    ...anchors.map((anchor) => anchor.id), ...retired.map((row) => row.id)] : [];
  for (const id of invalidated) {
    statements.push({ sql: DELETE_NODE_SEARCH_PENDING_SQL, params: [id] },
      { sql: INSERT_NODE_SEARCH_PENDING_SQL, params: [id, now, now] });
  }
  if (input.searchInvalidations) statements.push({
    sql: 'UPDATE settings SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT), updated_at = ? WHERE key = ?',
    params: [now, WORKSPACE_SEARCH_SOURCE_REVISION_KEY]
  }, {
    sql: 'UPDATE settings SET value = (SELECT value FROM settings WHERE key = ?), updated_at = ? WHERE key = ?',
    params: [WORKSPACE_SEARCH_SOURCE_REVISION_KEY, now, WORKSPACE_SEARCH_QUEUED_REVISION_KEY]
  });
  return { ids, moved, retired, statements };
}

export function nodeBodyMigrationPartPattern(nodeId: string) {
  return `${bodyPartPrefix(nodeId)}%`;
}
