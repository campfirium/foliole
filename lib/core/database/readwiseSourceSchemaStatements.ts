export const READWISE_SOURCE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS readwise_sources (
    source_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL DEFAULT 'default',
    reader_document_id TEXT NOT NULL,
    readwise_book_id TEXT,
    title TEXT NOT NULL DEFAULT '',
    author TEXT,
    category TEXT,
    location TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',
    source_url TEXT,
    raw_source_url TEXT,
    raw_source_url_status TEXT NOT NULL DEFAULT 'unknown',
    remote_updated_at TEXT,
    sync_cursor TEXT,
    sync_status TEXT NOT NULL DEFAULT 'idle',
    source_state TEXT NOT NULL DEFAULT 'external',
    promotion_lock INTEGER NOT NULL DEFAULT 0,
    internal_node_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(account_id, reader_document_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_readwise_sources_state
    ON readwise_sources (source_state, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_readwise_sources_status
    ON readwise_sources (sync_status, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_readwise_sources_internal_node
    ON readwise_sources (internal_node_id)`,
  `CREATE TABLE IF NOT EXISTS readwise_source_annotations (
    source_id TEXT NOT NULL,
    readwise_book_id TEXT NOT NULL,
    highlight_id TEXT NOT NULL,
    reader_document_id TEXT NOT NULL,
    parent_id TEXT,
    annotation_kind TEXT NOT NULL DEFAULT 'highlight',
    text TEXT,
    note TEXT,
    location TEXT,
    remote_updated_at TEXT,
    deleted_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (readwise_book_id, highlight_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_readwise_source_annotations_source
    ON readwise_source_annotations (source_id, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_readwise_source_annotations_parent
    ON readwise_source_annotations (source_id, parent_id)`
];
