import { CORE_INDEX_SCHEMA_STATEMENTS } from './coreIndexSchemaStatements.js';
import { NODE_SYNC_TOMBSTONE_SCHEMA_STATEMENTS } from './nodeSyncTombstoneSchemaStatements.js';

export const DESKTOP_CORE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES nodes(id),
    kind TEXT NOT NULL DEFAULT 'topic',
    priority INTEGER,
    desired_retention REAL,
    enable_short_term INTEGER,
    sequential_reading_enabled INTEGER,
    shelved_at TEXT,
    manual_child_order TEXT,
    title TEXT NOT NULL,
    is_title_manual INTEGER NOT NULL DEFAULT 0,
    hide_title_heading INTEGER NOT NULL DEFAULT 0,
    content TEXT NOT NULL DEFAULT '',
    body_blob_hash TEXT,
    opening_text TEXT,
    virtual_filter TEXT,
    reveal TEXT,
    anchor_link TEXT,
    anchor_resolution_status TEXT,
    anchor_source_version_id TEXT,
    image_regions TEXT,
    import_source_fingerprint TEXT,
    import_content_fingerprint TEXT,
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
    body_text TEXT,
    snapshot_json TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS node_sync_version_parents (
    version_id TEXT NOT NULL REFERENCES node_sync_versions(version_id) ON DELETE CASCADE,
    parent_version_id TEXT NOT NULL,
    ordinal INTEGER NOT NULL,
    PRIMARY KEY (version_id, parent_version_id),
    UNIQUE (version_id, ordinal)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_node_sync_versions_object_created
    ON node_sync_versions (object_id, created_at)`,
  ...NODE_SYNC_TOMBSTONE_SCHEMA_STATEMENTS,
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
  `CREATE TABLE IF NOT EXISTS node_text_alternatives (
    alternative_id TEXT PRIMARY KEY,
    node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    source_version_id TEXT NOT NULL,
    body_text TEXT NOT NULL,
    source_device_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_node_text_alternatives_source_version
    ON node_text_alternatives (node_id, source_version_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_node_text_alternatives_available_source
    ON node_text_alternatives (node_id, source_device_id) WHERE status = 'available'`,
  `CREATE TABLE IF NOT EXISTS sync_peers (
    peer_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'paired',
    last_synced_at TEXT,
    last_seen_version_cursor TEXT,
    primary_device_epoch INTEGER,
    primary_committed_at TEXT,
    primary_updated_by_device_id TEXT,
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
    repetition_count INTEGER NOT NULL DEFAULT 0,
    state TEXT NOT NULL DEFAULT 'active'
  )`,
  `CREATE TABLE IF NOT EXISTS node_open_state (
    node_id TEXT PRIMARY KEY REFERENCES nodes(id) ON DELETE CASCADE,
    last_opened_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS node_reading_host_state (
    node_id TEXT NOT NULL REFERENCES nodes(id),
    host_name TEXT NOT NULL,
    reading_position INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (node_id, host_name)
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
    node_id TEXT NOT NULL,
    host_name TEXT NOT NULL,
    scroll_top INTEGER NOT NULL DEFAULT 0,
    selection_from INTEGER,
    selection_to INTEGER,
    source TEXT NOT NULL DEFAULT 'user-scroll',
    updated_at TEXT NOT NULL,
    PRIMARY KEY (node_id, host_name)
  )`,
  ...CORE_INDEX_SCHEMA_STATEMENTS
];
