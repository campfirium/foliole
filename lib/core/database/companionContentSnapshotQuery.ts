import { ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS } from './androidCompanionNodeResourceQueryDefinitions.js';
import { SNAPSHOT_VISIBLE_NODES_CTE_SQL } from './workspaceVisibleNodesSql.js';

// Walk only the selected nodes' ancestors to determine visibility. Walking down
// from every root would still visit the entire library before projecting two rows.
const scopedVisibility = `WITH RECURSIVE selected_nodes AS (
  SELECT id, parent_id, deleted_at FROM nodes
  WHERE id IN (SELECT value FROM json_each(?)) OR parent_id IN (SELECT value FROM json_each(?))
), ancestors(origin, id, parent_id, deleted_at) AS (
  SELECT id, id, parent_id, deleted_at FROM selected_nodes
  UNION
  SELECT ancestor.origin, parent.id, parent.parent_id, parent.deleted_at
  FROM ancestors ancestor JOIN nodes parent ON parent.id = ancestor.parent_id
), visible_nodes AS (
  SELECT origin AS id FROM ancestors GROUP BY origin
  HAVING SUM(deleted_at IS NOT NULL) = 0 AND MAX(parent_id IS NULL) = 1
)`;

export const COMPANION_CONTENT_SNAPSHOT_SQL = ANDROID_COMPANION_NODE_RESOURCE_QUERY_DEFINITIONS.workspaceSnapshotNodes.sql
  .replace(SNAPSHOT_VISIBLE_NODES_CTE_SQL, scopedVisibility)
  .replace('FROM nodes n LEFT JOIN visible_nodes',
    'FROM selected_nodes selected JOIN nodes n ON n.id = selected.id LEFT JOIN visible_nodes');
