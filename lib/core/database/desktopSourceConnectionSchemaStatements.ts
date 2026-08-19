export const WATCHED_FOLDER_BINDING_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS watched_folder_bindings (
    binding_id TEXT PRIMARY KEY,
    connected_device_id TEXT,
    connected_device_name TEXT,
    connected_platform TEXT,
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
    source_ref TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_watched_folder_bindings_device
    ON watched_folder_bindings (connected_device_id, updated_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_watched_folder_bindings_device_path
    ON watched_folder_bindings (connected_device_id, primary_path)
    WHERE connected_device_id IS NOT NULL AND connection_status = 'connected' AND deleted_at IS NULL`
];
