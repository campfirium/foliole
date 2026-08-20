export const WATCHED_FOLDER_BINDING_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS watched_folder_bindings (
    binding_id TEXT PRIMARY KEY,
    connection_status TEXT NOT NULL DEFAULT 'needs-folder'
      CHECK (connection_status IN ('connected', 'needs-folder')),
    action_mode TEXT NOT NULL,
    archive_path TEXT NOT NULL DEFAULT '',
    highlight_mode TEXT NOT NULL,
    highlight_path TEXT NOT NULL DEFAULT '',
    primary_path TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    source_ref TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_watched_folder_bindings_source
    ON watched_folder_bindings (source_ref, updated_at)`
];
