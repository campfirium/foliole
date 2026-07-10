export const ANDROID_COMPANION_SYNC_NODE_VERSIONS_SQL =
  "SELECT * FROM (SELECT v.version_id, v.object_id, 'node' AS object_type, v.parent_version_id, v.device_id, " +
  '0 AS is_tombstone, v.created_at AS version_created_at, n.updated_at AS updated_at, ' +
  'v.content_hash, v.snapshot_json AS snapshot FROM node_sync_versions v INNER JOIN nodes n ON n.id = v.object_id ' +
  "WHERE v.device_id = ?1 AND (?2 = '' OR ?3 = '' OR v.created_at > ?4 OR (v.created_at = ?5 AND v.version_id > ?6)) " +
  "AND v.object_id NOT LIKE 'conflict-copy-%' " +
  'AND n.current_version_id = v.version_id AND n.deleted_at IS NULL UNION ALL ' +
  "SELECT t.version_id, t.node_id AS object_id, 'node' AS object_type, t.parent_version_id, t.device_id, " +
  '1 AS is_tombstone, t.created_at AS version_created_at, t.deleted_at AS updated_at, ' +
  't.content_hash, t.snapshot_json AS snapshot FROM node_sync_tombstones t ' +
  "WHERE t.device_id = ?1 AND (?2 = '' OR ?3 = '' OR t.created_at > ?4 OR (t.created_at = ?5 AND t.version_id > ?6)) " +
  "AND t.node_id NOT LIKE 'conflict-copy-%') " +
  'ORDER BY version_created_at ASC, version_id ASC LIMIT ?7';
