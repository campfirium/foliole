export const SYNC_DELIVERY_TRIGGER_STATEMENTS = [
  `CREATE TRIGGER IF NOT EXISTS trg_sync_delivery_state_insert
   AFTER INSERT ON sync_object_state WHEN NEW.sync_dirty = 1
   BEGIN
     INSERT OR IGNORE INTO sync_delivery_receipts (
       peer_id, stream_name, operation_id, object_type, object_id, payload_identity,
       local_position, status, remote_position, issue_reason, created_at, updated_at
     )
     SELECT member.device_id,
       CASE WHEN NEW.object_type = 'node' THEN 'node_version' ELSE 'state' END,
       CASE WHEN NEW.object_type = 'node' THEN 'node:' || COALESCE(NEW.current_version_id, NEW.object_id)
            ELSE NEW.object_type || ':' || NEW.object_id || ':' || NEW.state_seq END,
       NEW.object_type, NEW.object_id,
       CASE WHEN NEW.object_type = 'node' THEN COALESCE(NEW.current_version_id, NEW.content_hash)
            ELSE NEW.content_hash END,
       CAST(NEW.state_seq AS TEXT), 'pending', NULL, NULL, NEW.updated_at, NEW.updated_at
     FROM sync_group_members member
     JOIN sync_group_local_state local ON local.group_id = member.group_id AND local.singleton_id = 1
     WHERE member.state = 'active' AND member.device_id <> local.local_device_id
       AND (NEW.object_type <> 'watched_folder' OR member.device_kind NOT IN
         ('android', 'android-capacitor', 'ios', 'ios-capacitor'))
       AND NEW.updated_at >= member.joined_at;
   END`,
  `CREATE TRIGGER IF NOT EXISTS trg_sync_delivery_state_update
   AFTER UPDATE OF state_seq, sync_dirty ON sync_object_state WHEN NEW.sync_dirty = 1
   BEGIN
     INSERT OR IGNORE INTO sync_delivery_receipts (
       peer_id, stream_name, operation_id, object_type, object_id, payload_identity,
       local_position, status, remote_position, issue_reason, created_at, updated_at
     )
     SELECT member.device_id,
       CASE WHEN NEW.object_type = 'node' THEN 'node_version' ELSE 'state' END,
       CASE WHEN NEW.object_type = 'node' THEN 'node:' || COALESCE(NEW.current_version_id, NEW.object_id)
            ELSE NEW.object_type || ':' || NEW.object_id || ':' || NEW.state_seq END,
       NEW.object_type, NEW.object_id,
       CASE WHEN NEW.object_type = 'node' THEN COALESCE(NEW.current_version_id, NEW.content_hash)
            ELSE NEW.content_hash END,
       CAST(NEW.state_seq AS TEXT), 'pending', NULL, NULL, NEW.updated_at, NEW.updated_at
     FROM sync_group_members member
     JOIN sync_group_local_state local ON local.group_id = member.group_id AND local.singleton_id = 1
     WHERE member.state = 'active' AND member.device_id <> local.local_device_id
       AND (NEW.object_type <> 'watched_folder' OR member.device_kind NOT IN
         ('android', 'android-capacitor', 'ios', 'ios-capacitor'))
       AND NEW.updated_at >= member.joined_at;
   END`,
  `CREATE TRIGGER IF NOT EXISTS trg_sync_delivery_member_leave
   AFTER UPDATE OF state ON sync_group_members WHEN NEW.state = 'left'
   BEGIN
     DELETE FROM sync_delivery_receipts WHERE peer_id = NEW.device_id;
     DELETE FROM sync_peer_cursors WHERE peer_id = NEW.device_id;
   END`,
  `CREATE TRIGGER IF NOT EXISTS trg_sync_delivery_review_insert
   AFTER INSERT ON review_log
   BEGIN
     INSERT OR IGNORE INTO sync_delivery_receipts (
       peer_id, stream_name, operation_id, object_type, object_id, payload_identity,
       local_position, status, remote_position, issue_reason, created_at, updated_at
     )
     SELECT member.device_id, 'review_log', 'review_log:' || NEW.op_id,
       'review_log', NEW.op_id, NEW.op_id, NEW.reviewed_at, 'pending', NULL, NULL,
       NEW.reviewed_at, NEW.reviewed_at
     FROM sync_group_members member
     JOIN sync_group_local_state local ON local.group_id = member.group_id AND local.singleton_id = 1
     WHERE member.state = 'active' AND member.device_id <> local.local_device_id
       AND NEW.device_id = local.local_device_id AND NEW.reviewed_at >= member.joined_at;
   END`
] as const;
