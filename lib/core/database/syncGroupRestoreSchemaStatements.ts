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
    ON sync_group_restore_events (group_id, restored_at DESC, restore_id DESC)`
] as const;
