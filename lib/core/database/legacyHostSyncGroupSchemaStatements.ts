export const LEGACY_HOST_SYNC_GROUP_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sync_groups (
    group_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    timeline_id TEXT NOT NULL,
    created_by_host_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    workgroup_key TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS sync_group_members (
    group_id TEXT NOT NULL REFERENCES sync_groups(group_id) ON DELETE CASCADE,
    host_name TEXT NOT NULL,
    host_platform TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('provisioning', 'active', 'left')),
    approved_by_host_name TEXT NOT NULL,
    authorization_id TEXT NOT NULL,
    provisioning_cursor INTEGER,
    joined_at TEXT NOT NULL,
    activated_at TEXT,
    left_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (group_id, host_name),
    UNIQUE (authorization_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sync_group_members_state
    ON sync_group_members (group_id, state, updated_at)`,
  `CREATE TABLE IF NOT EXISTS sync_group_member_departures (
    group_id TEXT NOT NULL REFERENCES sync_groups(group_id) ON DELETE CASCADE,
    host_name TEXT NOT NULL,
    authorized_by_host_name TEXT NOT NULL,
    authorization_id TEXT NOT NULL UNIQUE,
    left_at TEXT NOT NULL,
    PRIMARY KEY (group_id, host_name)
  )`,
  `CREATE TABLE IF NOT EXISTS sync_group_local_state (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    group_id TEXT REFERENCES sync_groups(group_id) ON DELETE CASCADE,
    local_host_name TEXT NOT NULL,
    member_state TEXT NOT NULL CHECK (member_state IN ('provisioning', 'active')),
    provisioning_cursor INTEGER,
    created_empty_proof_json TEXT,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sync_group_nonce_ledger (
    group_id TEXT NOT NULL REFERENCES sync_groups(group_id) ON DELETE CASCADE,
    identity TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (group_id, identity)
  )`
] as const;

export const LEGACY_HOST_SYNC_DELIVERY_TRIGGER_STATEMENTS = [
  deliveryStateTrigger('trg_sync_delivery_state_insert', 'AFTER INSERT ON sync_object_state'),
  deliveryStateTrigger(
    'trg_sync_delivery_state_update',
    'AFTER UPDATE OF state_seq, sync_dirty ON sync_object_state'
  ),
  `CREATE TRIGGER IF NOT EXISTS trg_sync_delivery_member_leave
   AFTER UPDATE OF state ON sync_group_members WHEN NEW.state = 'left' BEGIN
     DELETE FROM sync_delivery_receipts WHERE authorization_id = NEW.authorization_id;
     DELETE FROM sync_peer_cursors WHERE authorization_id = NEW.authorization_id;
   END`,
  `CREATE TRIGGER IF NOT EXISTS trg_sync_delivery_review_insert
   AFTER INSERT ON review_log BEGIN
     INSERT OR IGNORE INTO sync_delivery_receipts (
       authorization_id, stream_name, operation_id, object_type, object_id, payload_identity,
       local_position, status, remote_position, issue_reason, created_at, updated_at
     )
     SELECT member.authorization_id, 'review_log', 'review_log:' || NEW.op_id,
       'review_log', NEW.op_id, NEW.op_id, NEW.reviewed_at, 'pending', NULL, NULL,
       NEW.reviewed_at, NEW.reviewed_at
     FROM sync_group_members member
     JOIN sync_group_local_state local ON local.group_id = member.group_id AND local.singleton_id = 1
     WHERE member.state = 'active' AND member.host_name <> local.local_host_name
       AND NEW.reviewed_at >= member.joined_at;
   END`
] as const;

export function createLegacyAuthorizationDeliveryTableStatement(table = 'sync_delivery_receipts') {
  return `CREATE TABLE ${table} (
    authorization_id TEXT NOT NULL,
    stream_name TEXT NOT NULL,
    operation_id TEXT NOT NULL,
    object_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    payload_identity TEXT NOT NULL,
    local_position TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'confirmed', 'conflict', 'rejected')),
    remote_position TEXT,
    issue_reason TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (authorization_id, stream_name, operation_id)
  )`;
}

function deliveryStateTrigger(name: string, event: string) {
  return `CREATE TRIGGER IF NOT EXISTS ${name}
   ${event} WHEN NEW.sync_dirty = 1 BEGIN
     INSERT OR IGNORE INTO sync_delivery_receipts (
       authorization_id, stream_name, operation_id, object_type, object_id, payload_identity,
       local_position, status, remote_position, issue_reason, created_at, updated_at
     )
     SELECT member.authorization_id,
       CASE WHEN NEW.object_type = 'node' THEN 'node_version' ELSE 'state' END,
       CASE WHEN NEW.object_type = 'node' THEN 'node:' || COALESCE(NEW.current_version_id, NEW.object_id)
            ELSE NEW.object_type || ':' || NEW.object_id || ':' || NEW.state_seq END,
       NEW.object_type, NEW.object_id,
       CASE WHEN NEW.object_type = 'node' THEN COALESCE(NEW.current_version_id, NEW.content_hash)
            ELSE NEW.content_hash END,
       CAST(NEW.state_seq AS TEXT), 'pending', NULL, NULL, NEW.updated_at, NEW.updated_at
     FROM sync_group_members member
     JOIN sync_group_local_state local ON local.group_id = member.group_id AND local.singleton_id = 1
     WHERE member.state = 'active' AND member.host_name <> local.local_host_name
       AND NEW.updated_at >= member.joined_at;
   END`;
}
