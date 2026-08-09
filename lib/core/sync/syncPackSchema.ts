import { buildSyncPackNodesTableSql } from './syncPackNodeFields.js';

export const PACK_SCHEMA = [
  `CREATE TABLE pack_manifest (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE sync_groups (
    group_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    timeline_id TEXT NOT NULL,
    created_by_device_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE sync_group_members (
    group_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    device_kind TEXT NOT NULL,
    device_name TEXT NOT NULL,
    state TEXT NOT NULL,
    approved_by_device_id TEXT NOT NULL,
    authorization_id TEXT NOT NULL,
    joined_at TEXT NOT NULL,
    left_at TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (group_id, device_id),
    UNIQUE (authorization_id)
  )`,
  `CREATE TABLE sync_group_member_departures (
    group_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    authorized_by_device_id TEXT NOT NULL,
    authorization_id TEXT NOT NULL UNIQUE,
    left_at TEXT NOT NULL,
    PRIMARY KEY (group_id, device_id)
  )`,
  `CREATE TABLE sync_object_state (
    object_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    state_seq INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    PRIMARY KEY (object_type, object_id)
  )`,
  `CREATE TABLE sync_objects (
    object_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    payload_json TEXT,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    PRIMARY KEY (object_type, object_id)
  )`,
  buildSyncPackNodesTableSql(),
  `CREATE TABLE node_sync_versions (
    version_id TEXT PRIMARY KEY,
    object_id TEXT NOT NULL,
    parent_version_id TEXT,
    device_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    body_text TEXT,
    snapshot_json TEXT NOT NULL
  )`,
  `CREATE TABLE node_sync_version_parents (
    version_id TEXT NOT NULL,
    parent_version_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    PRIMARY KEY (version_id, parent_version_id),
    UNIQUE (version_id, ordinal)
  )`,
  `CREATE TABLE node_attachments (
    node_id TEXT NOT NULL,
    attachment_id TEXT NOT NULL,
    role TEXT NOT NULL,
    PRIMARY KEY (node_id, attachment_id, role)
  )`,
  `CREATE TABLE node_order (
    node_id TEXT PRIMARY KEY,
    position INTEGER NOT NULL
  )`,
  `CREATE TABLE external_documents (
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
    content TEXT NOT NULL DEFAULT '',
    indexed_at TEXT NOT NULL,
    is_present INTEGER NOT NULL DEFAULT 1,
    missing_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE content_blobs (
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
  `CREATE TABLE review_log (
    id TEXT PRIMARY KEY,
    op_id TEXT NOT NULL UNIQUE,
    device_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    grade INTEGER NOT NULL,
    scheduler_version TEXT NOT NULL,
    reviewed_at TEXT NOT NULL,
    due_before TEXT NOT NULL,
    stability_before REAL NOT NULL,
    difficulty_before REAL NOT NULL,
    due_after TEXT NOT NULL,
    stability_after REAL NOT NULL,
    difficulty_after REAL NOT NULL
  )`
];
