import { WATCHED_FOLDER_BINDING_SCHEMA_STATEMENTS } from './desktopSourceConnectionSchemaStatements.js';
import { DESKTOP_SOURCE_SCHEMA_STATEMENTS } from './desktopSourceSchemaStatements.js';

export const ANDROID_COMPANION_RESOURCE_SCHEMA_STATEMENTS = [
  ...DESKTOP_SOURCE_SCHEMA_STATEMENTS,
  `CREATE TABLE IF NOT EXISTS attachment_blobs (
    attachment_id TEXT PRIMARY KEY,
    content_hash TEXT,
    storage_key TEXT,
    size_bytes INTEGER,
    mime_type TEXT,
    availability TEXT NOT NULL DEFAULT 'missing',
    source_host_name TEXT,
    created_at TEXT NOT NULL,
    cached_at TEXT,
    last_verified_at TEXT
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
    source_host_name TEXT,
    created_at TEXT NOT NULL,
    cached_at TEXT,
    last_verified_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_content_blobs_availability
    ON content_blobs (availability)`,
  `CREATE INDEX IF NOT EXISTS idx_content_blobs_kind
    ON content_blobs (kind)`,
  `CREATE TABLE IF NOT EXISTS content_blob_data (
    hash TEXT PRIMARY KEY,
    data BLOB NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS pdf_page_text (
    attachment_id TEXT NOT NULL,
    page INTEGER NOT NULL,
    text TEXT NOT NULL,
    page_width REAL,
    page_height REAL,
    PRIMARY KEY (attachment_id, page)
  )`,
  `CREATE TABLE IF NOT EXISTS import_sources (
    source_fingerprint TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    source_kind TEXT NOT NULL,
    source_name TEXT NOT NULL,
    source_locator TEXT NOT NULL,
    first_imported_at TEXT NOT NULL,
    last_imported_at TEXT NOT NULL,
    last_content_fingerprint TEXT NOT NULL,
    latest_node_id TEXT,
    watched_binding_id TEXT,
    watched_relative_path TEXT,
    source_ref TEXT,
    source_location TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS external_search_folders (
    id TEXT PRIMARY KEY,
    folder_path TEXT NOT NULL,
    attachment_mode TEXT NOT NULL,
    attachment_root_path TEXT,
    excluded_dirs_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'idle',
    document_count INTEGER NOT NULL DEFAULT 0,
    indexed_at TEXT,
    last_error TEXT,
    owner_installation_id TEXT,
    owner_device_name TEXT,
    owner_platform TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    source_ref TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_external_search_folders_owner_path
    ON external_search_folders (owner_installation_id, folder_path)
    WHERE owner_installation_id IS NOT NULL`,
  ...WATCHED_FOLDER_BINDING_SCHEMA_STATEMENTS,
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
    title TEXT,
    opening_text TEXT,
    body_blob_hash TEXT,
    content TEXT NOT NULL,
    indexed_at TEXT NOT NULL,
    is_present INTEGER NOT NULL DEFAULT 1,
    missing_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`
];
