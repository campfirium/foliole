export const REQUEST_CHAIN_HEAD_SQL = `SELECT COALESCE(node.current_version_id, tomb.version_id) AS current_version_id,
  COALESCE(node.sync_dirty, 0) AS sync_dirty, COALESCE(node.kind, json_extract(version.snapshot_json, '$.kind')) AS kind
  FROM (SELECT ? AS id) requested LEFT JOIN nodes node ON node.id = requested.id
  LEFT JOIN node_sync_tombstones tomb ON tomb.node_id = requested.id
  LEFT JOIN node_sync_versions version ON version.version_id = tomb.version_id`;
