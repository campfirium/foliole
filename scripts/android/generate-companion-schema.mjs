/* global console */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const outputPath = path.join(repoRoot, 'android/app/src/main/assets/companion-core-schema.json');

const statements = [
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
  `CREATE TABLE IF NOT EXISTS node_sync_versions (
    version_id TEXT PRIMARY KEY,
    object_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    parent_version_id TEXT,
    device_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    snapshot_json TEXT
  )`,
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
    node_id TEXT PRIMARY KEY REFERENCES nodes(id),
    scroll_top INTEGER NOT NULL DEFAULT 0,
    selection_from INTEGER,
    selection_to INTEGER,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    original_name TEXT,
    mime_type TEXT,
    size_bytes INTEGER,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS node_attachments (
    node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    attachment_id TEXT NOT NULL REFERENCES attachments(id),
    role TEXT NOT NULL,
    PRIMARY KEY (node_id, attachment_id, role)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_node_attachments_attachment_id ON node_attachments (attachment_id)',
  `CREATE TABLE IF NOT EXISTS attachment_blobs (
    attachment_id TEXT PRIMARY KEY,
    content_hash TEXT,
    storage_key TEXT,
    size_bytes INTEGER,
    mime_type TEXT,
    availability TEXT NOT NULL DEFAULT 'missing',
    source_device_id TEXT,
    created_at TEXT NOT NULL,
    cached_at TEXT,
    last_verified_at TEXT
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
    latest_node_id TEXT
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
    content TEXT NOT NULL,
    indexed_at TEXT NOT NULL,
    is_present INTEGER NOT NULL DEFAULT 1,
    missing_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS setting_records (
    key TEXT NOT NULL,
    scope TEXT NOT NULL,
    platform TEXT NOT NULL,
    form_factor TEXT NOT NULL,
    device_id TEXT NOT NULL,
    value_json TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    PRIMARY KEY (key, scope, platform, form_factor, device_id)
  )`,
  `CREATE TABLE IF NOT EXISTS sync_object_state (
    object_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    state_seq INTEGER NOT NULL,
    current_version_id TEXT,
    content_hash TEXT NOT NULL,
    last_modified_by_device_id TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    sync_dirty INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (object_type, object_id),
    UNIQUE (state_seq)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sync_object_state_seq
    ON sync_object_state (state_seq)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_object_state_type_seq
    ON sync_object_state (object_type, state_seq)`,
  `CREATE TABLE IF NOT EXISTS sync_change_log (
    change_id TEXT PRIMARY KEY,
    object_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    change_type TEXT NOT NULL,
    device_id TEXT NOT NULL,
    base_version_id TEXT,
    result_version_id TEXT,
    content_hash TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    applied_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS sync_peer_cursors (
    peer_id TEXT NOT NULL,
    stream_name TEXT NOT NULL,
    cursor_value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (peer_id, stream_name)
  )`
];

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify({ statements }, null, 2)}\n`, 'utf8');
console.info('[android-schema] wrote companion schema artifact', outputPath);
