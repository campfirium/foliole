export const ANDROID_COMPANION_HOST_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS companion_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sync_push_ack (
    client_op_id TEXT PRIMARY KEY NOT NULL,
    object_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    state_seq INTEGER,
    status TEXT NOT NULL,
    acked_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sync_push_ack_identity
    ON sync_push_ack (object_type, object_id, state_seq)`
];
