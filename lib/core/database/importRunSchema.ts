export const IMPORT_RUN_SCHEMA = `CREATE TABLE IF NOT EXISTS import_runs (
    id TEXT PRIMARY KEY,
    source_fingerprint TEXT NOT NULL,
    provider TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_name TEXT NOT NULL,
    source_locator TEXT NOT NULL,
    content_fingerprint TEXT NOT NULL,
    duplicate_semantic TEXT NOT NULL,
    result_status TEXT NOT NULL,
    node_id TEXT,
    imported_at TEXT NOT NULL,
    degraded_reason TEXT,
    failure_reason TEXT
  )`;
