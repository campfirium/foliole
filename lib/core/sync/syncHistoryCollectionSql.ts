import { nodeChildOwnerSql } from '../database/nodeChildStateSql.js';

const CHILD_EDGES = `child_edges(parent_id, child_id) AS (
    SELECT parent_version_id, version_id FROM node_sync_version_parents
    UNION SELECT parent_version_id, version_id FROM node_sync_versions WHERE parent_version_id IS NOT NULL)`;

/**
 * Versions something on this device still reads by identity; none of them is history to reclaim.
 * A text selection only names its origin version and never reads that record back.
 */
const REFERENCED = `referenced(version_id) AS (
    SELECT version_id FROM node_version_local_holds
    UNION SELECT base_version_id FROM sync_change_log WHERE applied_at IS NULL
    UNION SELECT result_version_id FROM sync_change_log WHERE applied_at IS NULL
    UNION SELECT conflict_version_id FROM node_sync_conflicts
    UNION SELECT parent_version_id FROM node_sync_conflicts
    UNION SELECT source_version_id FROM node_text_alternatives
    UNION SELECT anchor_source_version_id FROM nodes
    UNION SELECT current_version_id FROM nodes
    UNION SELECT current_version_id FROM sync_object_state
    UNION SELECT version_id FROM node_sync_tombstones
    UNION SELECT parent_version_id FROM node_sync_tombstones)`;

/**
 * Bodyless versions of live, settled, unforked nodes whose successor was made before the group line.
 * A forked node keeps its whole history: its fork point is still a merge base.
 */
export const RECLAIMABLE_HISTORY_SQL = `WITH ${CHILD_EDGES}, ${REFERENCED},
  single_head(object_id) AS (SELECT version.object_id FROM node_sync_versions version
    WHERE NOT EXISTS (SELECT 1 FROM child_edges edge WHERE edge.parent_id = version.version_id)
    GROUP BY version.object_id HAVING count(*) = 1)
  SELECT version.version_id FROM node_sync_versions version
  JOIN nodes node ON node.id = version.object_id AND node.sync_dirty = 0
  JOIN single_head head ON head.object_id = version.object_id
  WHERE version.body_text IS NULL AND COALESCE(json_type(version.snapshot_json, '$.content'), 'null') <> 'text'
    AND version.version_id NOT IN (SELECT version_id FROM referenced WHERE version_id IS NOT NULL)
    AND EXISTS (SELECT 1 FROM child_edges edge JOIN node_sync_versions child ON child.version_id = edge.child_id
      WHERE edge.parent_id = version.version_id AND child.created_at < ?)
  ORDER BY version.version_id LIMIT ?`;

/** Permanent deletions every member applied before the group line; the node itself is long gone. */
export const RECLAIMABLE_TOMBSTONES_SQL = `SELECT tomb.node_id FROM node_sync_tombstones tomb
  WHERE tomb.deleted_at < ? AND NOT EXISTS (SELECT 1 FROM nodes WHERE id = tomb.node_id)
  ORDER BY tomb.node_id LIMIT ?`;

const placeholders = (count: number) => Array.from({ length: count }, () => '?').join(', ');

export function reclaimHistoryStatements(versionIds: readonly string[]) {
  const ids = placeholders(versionIds.length);
  return [
    `DELETE FROM node_sync_version_parents WHERE version_id IN (${ids})`,
    `DELETE FROM node_version_local_origins WHERE version_id IN (${ids})`,
    `DELETE FROM node_sync_versions WHERE version_id IN (${ids})`
  ];
}

/** Retained parent identities of other versions are left as they are; a missing parent is a valid gap. */
export const RECLAIM_TOMBSTONE_STATEMENTS = [
  `DELETE FROM sync_object_state WHERE deleted_at IS NOT NULL AND object_type <> 'node'
    AND ${nodeChildOwnerSql('sync_object_state')} = ?`,
  'DELETE FROM sync_node_child_owners WHERE node_id = ?',
  `DELETE FROM sync_object_state WHERE object_type = 'node' AND object_id = ?`,
  'DELETE FROM node_sync_conflicts WHERE object_id = ?',
  'DELETE FROM node_version_local_holds WHERE object_id = ?',
  `DELETE FROM node_sync_version_parents WHERE version_id IN
    (SELECT version_id FROM node_sync_versions WHERE object_id = ?)`,
  `DELETE FROM node_version_local_origins WHERE version_id IN
    (SELECT version_id FROM node_sync_versions WHERE object_id = ?)`,
  'DELETE FROM node_sync_versions WHERE object_id = ?',
  'DELETE FROM node_sync_tombstones WHERE node_id = ?'
] as const;
