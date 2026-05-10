export const DOCUMENT_SOURCE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS document_sources (
    source_id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    provider_document_id TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_name TEXT NOT NULL DEFAULT '',
    source_locator TEXT NOT NULL DEFAULT '',
    source_fingerprint TEXT NOT NULL,
    content_fingerprint TEXT NOT NULL DEFAULT '',
    presentation_state TEXT NOT NULL DEFAULT 'external'
      CHECK (presentation_state IN ('external', 'internal', 'ignored')),
    availability_state TEXT NOT NULL DEFAULT 'available'
      CHECK (availability_state IN ('available', 'missing', 'deleted_remote', 'unknown')),
    sync_status TEXT NOT NULL DEFAULT 'idle'
      CHECK (sync_status IN ('idle', 'syncing', 'synced', 'failed', 'rate_limited')),
    internal_node_id TEXT,
    internalized_at TEXT,
    title TEXT,
    author TEXT,
    source_url TEXT,
    remote_updated_at TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CHECK (
      (presentation_state = 'internal' AND internal_node_id IS NOT NULL)
      OR (presentation_state <> 'internal' AND internal_node_id IS NULL)
    )
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_document_sources_provider_document
    ON document_sources (provider, provider_document_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_document_sources_fingerprint
    ON document_sources (source_fingerprint)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_document_sources_internal_node
    ON document_sources (internal_node_id)
    WHERE internal_node_id IS NOT NULL AND presentation_state = 'internal'`,
  `CREATE INDEX IF NOT EXISTS idx_document_sources_presentation
    ON document_sources (presentation_state, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_document_sources_sync
    ON document_sources (sync_status, updated_at)`
];

export const IMPORT_SOURCES_COMPAT_VIEW_STATEMENTS = [
  `DROP VIEW IF EXISTS import_sources`,
  `CREATE VIEW IF NOT EXISTS import_sources AS
    SELECT
      source_fingerprint,
      provider,
      source_kind,
      source_name,
      source_locator,
      first_seen_at AS first_imported_at,
      last_seen_at AS last_imported_at,
      content_fingerprint AS last_content_fingerprint,
      internal_node_id AS latest_node_id
    FROM document_sources`,
  `CREATE TRIGGER IF NOT EXISTS import_sources_insert
    INSTEAD OF INSERT ON import_sources
    BEGIN
      INSERT INTO document_sources (
        source_id, provider, provider_document_id, source_kind, source_name, source_locator,
        source_fingerprint, content_fingerprint, presentation_state, availability_state, sync_status,
        internal_node_id, internalized_at, title, first_seen_at, last_seen_at, created_at, updated_at
      ) VALUES (
        NEW.source_fingerprint, NEW.provider, NEW.source_fingerprint, NEW.source_kind, NEW.source_name,
        NEW.source_locator, NEW.source_fingerprint, NEW.last_content_fingerprint,
        CASE WHEN NEW.latest_node_id IS NULL THEN 'external' ELSE 'internal' END,
        'available', 'synced', NEW.latest_node_id,
        CASE WHEN NEW.latest_node_id IS NULL THEN NULL ELSE NEW.last_imported_at END,
        NEW.source_name, NEW.first_imported_at, NEW.last_imported_at, NEW.first_imported_at, NEW.last_imported_at
      )
      ON CONFLICT(source_id) DO UPDATE SET
        provider = excluded.provider,
        provider_document_id = excluded.provider_document_id,
        source_kind = excluded.source_kind,
        source_name = excluded.source_name,
        source_locator = excluded.source_locator,
        source_fingerprint = excluded.source_fingerprint,
        content_fingerprint = excluded.content_fingerprint,
        presentation_state = excluded.presentation_state,
        availability_state = excluded.availability_state,
        sync_status = excluded.sync_status,
        internal_node_id = excluded.internal_node_id,
        internalized_at = COALESCE(document_sources.internalized_at, excluded.internalized_at),
        title = excluded.title,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at;
    END`,
  `CREATE TRIGGER IF NOT EXISTS import_sources_update
    INSTEAD OF UPDATE ON import_sources
    BEGIN
      UPDATE document_sources SET
        provider = NEW.provider,
        provider_document_id = NEW.source_fingerprint,
        source_kind = NEW.source_kind,
        source_name = NEW.source_name,
        source_locator = NEW.source_locator,
        source_fingerprint = NEW.source_fingerprint,
        content_fingerprint = NEW.last_content_fingerprint,
        presentation_state = CASE WHEN NEW.latest_node_id IS NULL THEN 'external' ELSE 'internal' END,
        internal_node_id = NEW.latest_node_id,
        internalized_at = CASE
          WHEN NEW.latest_node_id IS NULL THEN NULL
          ELSE COALESCE(internalized_at, NEW.last_imported_at)
        END,
        title = NEW.source_name,
        last_seen_at = NEW.last_imported_at,
        updated_at = NEW.last_imported_at
      WHERE source_id = OLD.source_fingerprint;
    END`,
  `CREATE TRIGGER IF NOT EXISTS import_sources_delete
    INSTEAD OF DELETE ON import_sources
    BEGIN
      DELETE FROM document_sources WHERE source_id = OLD.source_fingerprint;
    END`
];

export const DOCUMENT_SOURCE_WITH_IMPORT_COMPAT_SCHEMA_STATEMENTS = [
  ...DOCUMENT_SOURCE_SCHEMA_STATEMENTS,
  ...IMPORT_SOURCES_COMPAT_VIEW_STATEMENTS
];
