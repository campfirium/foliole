export const LOCAL_FILE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS local_files (
    id TEXT PRIMARY KEY,
    absolute_path TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    file_size INTEGER,
    modified_at TEXT,
    last_opened_at TEXT NOT NULL,
    missing_at TEXT,
    cursor_from INTEGER,
    cursor_to INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_local_files_last_opened_at
    ON local_files (last_opened_at DESC)`
];
