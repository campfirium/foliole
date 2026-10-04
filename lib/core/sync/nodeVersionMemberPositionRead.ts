/** Only local processed heads and locally retained unabsorbed tips constitute an adoption set. */
export const LOCAL_NODE_POSITION_SQL = `WITH RECURSIVE current(version_id) AS (
  SELECT COALESCE(node.current_version_id, tomb.version_id)
    FROM (SELECT ? AS id) requested LEFT JOIN nodes node ON node.id = requested.id
    LEFT JOIN node_sync_tombstones tomb ON tomb.node_id = requested.id
) , ancestry(version_id) AS (
  SELECT version_id FROM current
  UNION SELECT edge.parent_version_id FROM node_sync_version_parents edge
    JOIN ancestry ON ancestry.version_id = edge.version_id
  UNION SELECT version.parent_version_id FROM node_sync_versions version
    JOIN ancestry ON ancestry.version_id = version.version_id WHERE version.parent_version_id IS NOT NULL
) SELECT version.version_id, CASE WHEN current.version_id = version.version_id THEN 1 ELSE 0 END AS adopted,
  CASE WHEN version.body_text IS NOT NULL OR json_type(version.snapshot_json, '$.content') = 'text'
    OR json_type(version.snapshot_json, '$.content') IS NULL THEN 1 ELSE 0 END AS complete
  FROM node_sync_versions version CROSS JOIN current
  WHERE version.object_id = ? AND (version.version_id = current.version_id OR (
    version.version_id NOT IN (SELECT version_id FROM ancestry)
    AND NOT EXISTS (SELECT 1 FROM node_sync_version_parents edge
      WHERE edge.parent_version_id = version.version_id)
    AND NOT EXISTS (SELECT 1 FROM node_sync_versions child WHERE child.parent_version_id = version.version_id)))
  ORDER BY version.version_id`;

export const LOCAL_NODE_POSITION_OWNER_SQL = `SELECT local.group_id,
  local.local_device_identity_key AS device_identity_key, proof.library_epoch, proof.proof_revision
  FROM sync_group_local_state local JOIN node_version_local_proof_state proof ON proof.singleton_id = 1
  WHERE local.singleton_id = 1 AND local.state = 'active'`;

export function describeLocalNodePosition(rows: Array<{ version_id: string; adopted: number; complete: number }>) {
  const adopted = rows.find((row) => row.adopted === 1);
  if (!adopted || rows.some((row) => row.complete !== 1)) throw new Error('node_position_body_unavailable');
  return { adopted_version_id: adopted.version_id,
    pending_version_ids_json: JSON.stringify(rows.filter((row) => row.adopted !== 1)
      .map((row) => row.version_id).sort()) };
}
