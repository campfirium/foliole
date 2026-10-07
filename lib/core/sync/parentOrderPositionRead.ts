import { versionRetiredPositionsSql } from './versionRetiredPositionsSql.js';

const EDGES_SQL = `SELECT version.version_id, parent.value AS parent_version_id
  FROM parent_order_versions version JOIN json_each(version.parent_version_ids_json) parent`;
const LOCAL_POSITION_SQL = `WITH RECURSIVE current(version_id) AS (
  SELECT version_id FROM parent_order_heads WHERE parent_id = ?
), edges AS (${EDGES_SQL}), ancestry(version_id) AS (
  SELECT version_id FROM current UNION SELECT edge.parent_version_id FROM edges edge
    JOIN ancestry ON ancestry.version_id = edge.version_id
) SELECT version.version_id, version.version_id = current.version_id AS adopted,
    version.child_ids_json != 'null' AS complete FROM parent_order_versions version CROSS JOIN current
  WHERE version.parent_id = ? AND (version.version_id = current.version_id OR (
    version.version_id NOT IN (SELECT version_id FROM ancestry)
    AND NOT EXISTS (SELECT 1 FROM edges edge WHERE edge.parent_version_id = version.version_id)))`;

export const RETIRE_RESOLVED_ORDER_POSITIONS_SQL = versionRetiredPositionsSql(
  'parent_order_member_positions', LOCAL_POSITION_SQL, EDGES_SQL);
