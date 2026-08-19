export const SYNC_GROUP_SCHEMA_STATEMENTS = [
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
];
