import { SYNC_DELIVERY_SCHEMA_STATEMENTS } from './syncDeliverySchemaStatements.js';

export const ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS setting_records (
    key TEXT NOT NULL,
    scope TEXT NOT NULL,
    platform TEXT NOT NULL,
    form_factor TEXT NOT NULL,
    host_name TEXT NOT NULL,
    value_json TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    PRIMARY KEY (key, scope, platform, form_factor, host_name)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_setting_records_lookup
    ON setting_records (key, scope, platform, form_factor, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_setting_records_host
    ON setting_records (host_name, updated_at)`,
  `CREATE TABLE IF NOT EXISTS sync_object_state (
    object_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    state_seq INTEGER NOT NULL,
    current_version_id TEXT,
    content_hash TEXT NOT NULL,
    last_modified_by_host_name TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    sync_dirty INTEGER NOT NULL DEFAULT 0,
    base_content_hash TEXT,
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
    host_name TEXT NOT NULL,
    base_version_id TEXT,
    result_version_id TEXT,
    content_hash TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    applied_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sync_change_log_object
    ON sync_change_log (object_type, object_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_change_log_host_created
    ON sync_change_log (host_name, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_change_log_created
    ON sync_change_log (created_at, change_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_change_log_result_version
    ON sync_change_log (result_version_id)`,
  `CREATE TABLE IF NOT EXISTS sync_peer_cursors (
    peer_id TEXT NOT NULL,
    stream_name TEXT NOT NULL,
    cursor_value TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (peer_id, stream_name)
  )`,
  ...SYNC_DELIVERY_SCHEMA_STATEMENTS
];
