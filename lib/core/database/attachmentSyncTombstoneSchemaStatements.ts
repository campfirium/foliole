export const ATTACHMENT_SYNC_TOMBSTONE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS attachment_sync_tombstones (
    attachment_id TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    deleted_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS attachment_retirement_obligations (
    journal_token TEXT PRIMARY KEY,
    library_scope TEXT NOT NULL,
    stage TEXT NOT NULL CHECK(stage IN ('database_committed', 'verified', 'finalized')),
    items_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`
];
