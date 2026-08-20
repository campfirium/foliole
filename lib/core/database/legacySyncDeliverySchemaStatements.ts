export const LEGACY_SYNC_DELIVERY_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sync_delivery_receipts (
    peer_id TEXT NOT NULL, stream_name TEXT NOT NULL, operation_id TEXT NOT NULL,
    object_type TEXT NOT NULL, object_id TEXT NOT NULL, payload_identity TEXT NOT NULL,
    local_position TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'confirmed', 'conflict', 'rejected')),
    remote_position TEXT, issue_reason TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY (peer_id, stream_name, operation_id))`,
  `CREATE INDEX IF NOT EXISTS idx_sync_delivery_object
    ON sync_delivery_receipts (peer_id, object_type, object_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_delivery_pending
    ON sync_delivery_receipts (peer_id, stream_name, status, local_position)`
] as const;

export const LEGACY_SYNC_DELIVERY_TRIGGER_STATEMENTS = [
  legacyStateTrigger('INSERT', ''),
  legacyStateTrigger('UPDATE', ' OF state_seq, sync_dirty'),
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
       AND NEW.reviewed_at >= member.joined_at;
   END`
] as const;

function legacyStateTrigger(event: 'INSERT' | 'UPDATE', updateColumns: string) {
  const suffix = event === 'INSERT' ? 'insert' : 'update';
  return `CREATE TRIGGER IF NOT EXISTS trg_sync_delivery_state_${suffix}
   AFTER ${event}${updateColumns} ON sync_object_state WHEN NEW.sync_dirty = 1
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
       AND NEW.updated_at >= member.joined_at;
   END`;
}
