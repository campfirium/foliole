export const DESKTOP_RESOURCE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS mirror_articles (
    article_id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
    relative_path TEXT NOT NULL,
    mirrored_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    original_name TEXT,
    mime_type TEXT,
    size_bytes INTEGER,
    created_at TEXT NOT NULL,
    pdf_index_status TEXT,
    pdf_indexed_at TEXT,
    pdf_index_error TEXT,
    pdf_index_version INTEGER,
    pdf_index_attempt INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS node_attachments (
    node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    attachment_id TEXT NOT NULL REFERENCES attachments(id),
    role TEXT NOT NULL,
    PRIMARY KEY (node_id, attachment_id, role)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_node_attachments_attachment_id ON node_attachments (attachment_id)',
  `CREATE TABLE IF NOT EXISTS import_sources (
    source_fingerprint TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_name TEXT NOT NULL,
    source_locator TEXT NOT NULL,
    first_imported_at TEXT NOT NULL,
    last_imported_at TEXT NOT NULL,
    last_content_fingerprint TEXT NOT NULL,
    latest_node_id TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS import_runs (
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
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS content_blobs (
    hash TEXT PRIMARY KEY,
    storage_key TEXT NOT NULL,
    kind TEXT NOT NULL,
    mime_type TEXT,
    compression TEXT NOT NULL DEFAULT 'none',
    original_size_bytes INTEGER NOT NULL,
    stored_size_bytes INTEGER NOT NULL,
    original_sha256 TEXT NOT NULL,
    stored_sha256 TEXT NOT NULL,
    availability TEXT NOT NULL DEFAULT 'missing',
    source_device_id TEXT,
    created_at TEXT NOT NULL,
    cached_at TEXT,
    last_verified_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_content_blobs_availability
    ON content_blobs (availability)`,
  `CREATE INDEX IF NOT EXISTS idx_content_blobs_kind
    ON content_blobs (kind)`,
  `CREATE TABLE IF NOT EXISTS content_blob_data (
    hash TEXT PRIMARY KEY REFERENCES content_blobs(hash) ON DELETE CASCADE,
    data BLOB NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS pdf_page_text (
    attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
    page INTEGER NOT NULL,
    text TEXT NOT NULL,
    page_width REAL,
    page_height REAL,
    PRIMARY KEY (attachment_id, page)
  )`,
  `CREATE TABLE IF NOT EXISTS external_search_folders (
    id TEXT PRIMARY KEY,
    folder_path TEXT NOT NULL UNIQUE,
    attachment_mode TEXT NOT NULL,
    attachment_root_path TEXT,
    excluded_dirs_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'idle',
    document_count INTEGER NOT NULL DEFAULT 0,
    indexed_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`
];
