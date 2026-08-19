export const DESKTOP_SOURCE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS desktop_sources (
    source_ref TEXT PRIMARY KEY,
    source_type TEXT NOT NULL CHECK (source_type IN ('external', 'watched', 'readwise')),
    config_ref TEXT NOT NULL,
    host_name TEXT NOT NULL,
    host_platform TEXT NOT NULL,
    owner_installation_id TEXT,
    root_path TEXT NOT NULL,
    path_flavor TEXT NOT NULL CHECK (path_flavor IN ('posix', 'windows')),
    type_settings_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (source_type, config_ref)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_desktop_sources_host
    ON desktop_sources (host_name, source_type, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_desktop_sources_owner
    ON desktop_sources (owner_installation_id, source_type, updated_at)`
];
