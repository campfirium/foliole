export const SYNC_DELIVERY_LEGACY_BACKFILL_SQL = `INSERT OR IGNORE INTO sync_delivery_receipts (
  peer_id, stream_name, operation_id, object_type, object_id, payload_identity,
  local_position, status, remote_position, issue_reason, created_at, updated_at
)
SELECT member.device_id,
  CASE WHEN state.object_type = 'node' THEN 'node_version' ELSE 'state' END,
  CASE WHEN state.object_type = 'node' THEN 'node:' || COALESCE(state.current_version_id, state.object_id)
       ELSE state.object_type || ':' || state.object_id || ':' || state.state_seq END,
  state.object_type, state.object_id,
  CASE WHEN state.object_type = 'node' THEN COALESCE(state.current_version_id, state.content_hash)
       ELSE state.content_hash END,
  CAST(state.state_seq AS TEXT), 'pending', NULL, NULL, state.updated_at, state.updated_at
FROM sync_object_state state
JOIN sync_group_local_state local ON local.singleton_id = 1
JOIN sync_group_members member ON member.group_id = local.group_id
WHERE state.sync_dirty = 1 AND member.state = 'active'
  AND member.device_id <> local.local_device_id`;
