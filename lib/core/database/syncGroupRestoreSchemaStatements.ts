export const SYNC_GROUP_RESTORE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sync_group_restore_events (
    restore_id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES sync_groups(group_id) ON DELETE CASCADE,
    restored_at TEXT NOT NULL,
    source_device_identity_key TEXT NOT NULL,
    applied_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sync_group_restore_events_latest
    ON sync_group_restore_events (group_id, restored_at DESC, restore_id DESC)`,
  `CREATE TABLE IF NOT EXISTS sync_group_restore_page_rows (
    restore_id TEXT NOT NULL REFERENCES sync_group_restore_events(restore_id) ON DELETE CASCADE,
    from_state_seq INTEGER NOT NULL,
    table_name TEXT NOT NULL,
    row_index INTEGER NOT NULL,
    payload_json TEXT NOT NULL,
    PRIMARY KEY (restore_id, from_state_seq, table_name, row_index)
  )`
] as const;
