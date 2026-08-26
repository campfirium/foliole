export const SYNC_GROUP_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sync_groups (
    group_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    workgroup_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sync_group_devices (
    group_id TEXT NOT NULL REFERENCES sync_groups(group_id) ON DELETE CASCADE,
    device_identity_key TEXT NOT NULL,
    device_anchor TEXT NOT NULL,
    canonical_library_path TEXT NOT NULL,
    device_name TEXT NOT NULL,
    platform TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('active', 'left')),
    joined_at TEXT NOT NULL,
    left_at TEXT,
    last_seen_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (group_id, device_identity_key)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sync_group_devices_state
    ON sync_group_devices (group_id, state, updated_at)`,
  `CREATE TABLE IF NOT EXISTS sync_group_local_state (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    group_id TEXT NOT NULL REFERENCES sync_groups(group_id) ON DELETE CASCADE,
    local_device_identity_key TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state = 'active'),
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sync_group_nonce_ledger (
    group_id TEXT NOT NULL REFERENCES sync_groups(group_id) ON DELETE CASCADE,
    identity TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (group_id, identity)
  )`
] as const;
