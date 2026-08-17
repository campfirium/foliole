export const SOURCE_OWNERSHIP_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS source_ownership_cutover (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    status TEXT NOT NULL CHECK (status IN ('pre_cutover', 'cutover')),
    cutover_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS watched_folder_bindings (
    binding_id TEXT PRIMARY KEY,
    owner_installation_id TEXT,
    owner_device_name TEXT,
    owner_platform TEXT,
    action_mode TEXT NOT NULL,
    archive_path TEXT NOT NULL,
    highlight_mode TEXT NOT NULL,
    highlight_path TEXT NOT NULL,
    keep_preview_json TEXT,
    primary_path TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    availability TEXT NOT NULL DEFAULT 'unknown',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_watched_folder_bindings_owner
    ON watched_folder_bindings (owner_installation_id, updated_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_watched_folder_bindings_owner_path
    ON watched_folder_bindings (owner_installation_id, primary_path)
    WHERE owner_installation_id IS NOT NULL AND deleted_at IS NULL`
];
