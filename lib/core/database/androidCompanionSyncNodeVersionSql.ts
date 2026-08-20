export const ANDROID_COMPANION_SYNC_NODE_VERSIONS_SQL =
  "SELECT * FROM (SELECT v.version_id, v.object_id, 'node' AS object_type, v.parent_version_id, v.host_name, " +
  '0 AS is_tombstone, v.created_at AS version_created_at, n.updated_at AS updated_at, ' +
  'v.content_hash, v.body_text, v.snapshot_json AS snapshot FROM node_sync_versions v INNER JOIN nodes n ON n.id = v.object_id ' +
  "WHERE v.host_name = ?1 AND (?3 = '' OR ?4 = '' OR v.created_at > ?5 OR (v.created_at = ?6 AND v.version_id > ?7)) " +
  "AND NOT EXISTS (SELECT 1 FROM sync_delivery_receipts receipt WHERE receipt.authorization_id = ?2 " +
  "AND receipt.stream_name = 'node_version' AND receipt.operation_id = 'node:' || v.version_id " +
  "AND receipt.status <> 'pending') " +
  'AND n.current_version_id = v.version_id AND n.deleted_at IS NULL UNION ALL ' +
  "SELECT t.version_id, t.node_id AS object_id, 'node' AS object_type, t.parent_version_id, t.host_name, " +
  '1 AS is_tombstone, t.created_at AS version_created_at, t.deleted_at AS updated_at, ' +
  't.content_hash, NULL AS body_text, t.snapshot_json AS snapshot FROM node_sync_tombstones t ' +
  "WHERE t.host_name = ?1 AND (?3 = '' OR ?4 = '' OR t.created_at > ?5 OR (t.created_at = ?6 AND t.version_id > ?7)) " +
  "AND NOT EXISTS (SELECT 1 FROM sync_delivery_receipts receipt WHERE receipt.authorization_id = ?2 " +
  "AND receipt.stream_name = 'node_version' AND receipt.operation_id = 'node:' || t.version_id " +
  "AND receipt.status <> 'pending') " +
  ') ' +
  'ORDER BY version_created_at ASC, version_id ASC LIMIT ?8';
