export const EXTERNAL_DOCUMENT_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS external_documents (
    document_id TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    extension TEXT NOT NULL,
    source_size_bytes INTEGER NOT NULL,
    source_modified_at TEXT NOT NULL,
    source_modified_ms INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    title TEXT NOT NULL,
    opening_text TEXT,
    content TEXT NOT NULL,
    indexed_at TEXT NOT NULL,
    is_present INTEGER NOT NULL DEFAULT 1,
    missing_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_external_documents_folder_relative
    ON external_documents (folder_id, relative_path)`,
  `CREATE INDEX IF NOT EXISTS idx_external_documents_hash
    ON external_documents (content_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_external_documents_present_updated
    ON external_documents (is_present, updated_at)`
];
