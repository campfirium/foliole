export const KEEP_IMPORT_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS keep_import_items (
    rule_id TEXT NOT NULL,
    source_path TEXT NOT NULL,
    source_mtime_ms INTEGER NOT NULL,
    source_size_bytes INTEGER NOT NULL,
    highlight_source_mtime_ms INTEGER,
    highlight_source_size_bytes INTEGER,
    source_state TEXT NOT NULL DEFAULT 'present',
    local_node_state TEXT NOT NULL DEFAULT 'not_imported',
    has_source_update INTEGER NOT NULL DEFAULT 0,
    last_node_id TEXT,
    last_status TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    deleted_at TEXT,
    last_imported_at TEXT,
    PRIMARY KEY (rule_id, source_path)
  )`,
  `CREATE TABLE IF NOT EXISTS keep_import_item_cache (
    rule_id TEXT NOT NULL,
    source_path TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    content_preview TEXT,
    source_mtime_ms INTEGER NOT NULL,
    source_size_bytes INTEGER NOT NULL,
    refreshed_at TEXT NOT NULL,
    refresh_error TEXT,
    PRIMARY KEY (rule_id, source_path)
  )`
];
