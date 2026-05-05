export const KEEP_IMPORT_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS keep_import_items (
    rule_id TEXT NOT NULL,
    source_path TEXT NOT NULL,
    source_mtime_ms INTEGER NOT NULL,
    source_size_bytes INTEGER NOT NULL,
    highlight_source_mtime_ms INTEGER,
    highlight_source_size_bytes INTEGER,
    has_source_update INTEGER NOT NULL DEFAULT 0,
    last_node_id TEXT,
    last_status TEXT NOT NULL,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    last_imported_at TEXT,
    PRIMARY KEY (rule_id, source_path)
  )`
];
