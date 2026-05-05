import { readUserVersion, setUserVersion } from './databaseUserVersion.js';
import { EXTERNAL_DOCUMENT_SCHEMA_STATEMENTS } from './externalDocumentSchemaStatements.js';
import type { DatabaseConnectionLike, DatabaseMigrationTarget } from './migrationTypes.js';
import { applyNumberedSchemaMigrations } from './numberedMigrations.js';
import { SYNC_SCHEMA_STATEMENTS } from './syncSchemaStatements.js';
import { migrateWorkspaceSearchIndexes } from './workspaceSearchMigration.js';

export const DATABASE_SCHEMA_VERSION = 29;

const CREATE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES nodes(id),
    kind TEXT NOT NULL DEFAULT 'topic',
    priority INTEGER,
    desired_retention REAL,
    title TEXT NOT NULL,
    is_title_manual INTEGER NOT NULL DEFAULT 0,
    hide_title_heading INTEGER NOT NULL DEFAULT 0,
    content TEXT NOT NULL DEFAULT '',
    body_blob_hash TEXT,
    opening_text TEXT,
    virtual_filter TEXT,
    reveal TEXT,
    anchor_link TEXT,
    image_regions TEXT,
    position INTEGER,
    current_version_id TEXT,
    last_modified_by_device_id TEXT,
    sync_dirty INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS node_sync_versions (
    version_id TEXT PRIMARY KEY,
    object_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    parent_version_id TEXT,
    device_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    snapshot_json TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_node_sync_versions_object_created
    ON node_sync_versions (object_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS node_sync_conflicts (
    conflict_version_id TEXT PRIMARY KEY,
    object_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    parent_version_id TEXT,
    device_id TEXT,
    content_hash TEXT,
    snapshot_json TEXT NOT NULL,
    detected_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_node_sync_conflicts_object_detected
    ON node_sync_conflicts (object_id, detected_at)`,
  `CREATE TABLE IF NOT EXISTS sync_peers (
    peer_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'paired',
    last_synced_at TEXT,
    last_seen_version_cursor TEXT,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS node_review (
    node_id TEXT PRIMARY KEY REFERENCES nodes(id),
    due TEXT NOT NULL,
    last_review_at TEXT,
    state INTEGER NOT NULL DEFAULT 0,
    stability REAL NOT NULL DEFAULT 0,
    difficulty REAL NOT NULL DEFAULT 0,
    elapsed_days INTEGER NOT NULL DEFAULT 0,
    scheduled_days INTEGER NOT NULL DEFAULT 0,
    reps INTEGER NOT NULL DEFAULT 0,
    lapses INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS node_reading (
    node_id TEXT PRIMARY KEY REFERENCES nodes(id),
    interval_duration_ms INTEGER NOT NULL DEFAULT 0,
    interval_growth_factor REAL NOT NULL DEFAULT 1,
    last_handled_at TEXT NOT NULL,
    next_at TEXT NOT NULL,
    priority REAL NOT NULL DEFAULT 0,
    reading_position INTEGER NOT NULL DEFAULT 0,
    repetition_count INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT 'active'
  )`,
  `CREATE TABLE IF NOT EXISTS review_log (
    id TEXT PRIMARY KEY,
    op_id TEXT NOT NULL UNIQUE,
    device_id TEXT NOT NULL,
    node_id TEXT NOT NULL REFERENCES nodes(id),
    grade INTEGER NOT NULL,
    scheduler_version TEXT NOT NULL,
    reviewed_at TEXT NOT NULL,
    due_before TEXT NOT NULL,
    stability_before REAL NOT NULL,
    difficulty_before REAL NOT NULL,
    due_after TEXT NOT NULL,
    stability_after REAL NOT NULL,
    difficulty_after REAL NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS node_order (
    node_id TEXT PRIMARY KEY REFERENCES nodes(id),
    position INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS workspace_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS node_view_state (
    node_id TEXT PRIMARY KEY,
    scroll_top INTEGER NOT NULL DEFAULT 0,
    selection_from INTEGER,
    selection_to INTEGER,
    updated_at TEXT NOT NULL
  )`,
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
  ...SYNC_SCHEMA_STATEMENTS,
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
  )`,
  ...EXTERNAL_DOCUMENT_SCHEMA_STATEMENTS
];

const LEGACY_REBUILD_REQUIRED_MESSAGE =
  'existing database schema is no longer supported; reset foliole.db and initialize fresh schema';

function createFreshSchema(sqlite: DatabaseMigrationTarget) {
  for (const statement of CREATE_SCHEMA_STATEMENTS) {
    sqlite.exec(statement);
  }
  migrateWorkspaceSearchIndexes(sqlite);
  setUserVersion(sqlite, DATABASE_SCHEMA_VERSION);
}

export function initializeDatabaseSchema(sqlite: DatabaseMigrationTarget) {
  const applyInTransaction = sqlite.transaction(() => {
    const currentVersion = readUserVersion(sqlite);
    if (currentVersion === 0) {
      createFreshSchema(sqlite);
      return;
    }
    if (currentVersion === DATABASE_SCHEMA_VERSION) {
      return;
    }
    if (currentVersion > DATABASE_SCHEMA_VERSION) {
      throw new Error(`database schema version ${currentVersion} is newer than supported`);
    }
    applyNumberedSchemaMigrations({
      currentVersion,
      legacyMessage: LEGACY_REBUILD_REQUIRED_MESSAGE,
      setUserVersion: (version) => setUserVersion(sqlite, version),
      sqlite,
      targetVersion: DATABASE_SCHEMA_VERSION
    });
  });
  applyInTransaction();
}

export function initializeDatabaseConnection<T extends DatabaseConnectionLike>(connection: T): T {
  initializeDatabaseSchema(connection.sqlite);
  return connection;
}

export function isLegacyDatabaseRebuildRequiredError(error: unknown): error is Error {
  return error instanceof Error && error.message === LEGACY_REBUILD_REQUIRED_MESSAGE;
}
