export const NODE_SYNC_TOMBSTONE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS node_sync_tombstones (
    node_id TEXT PRIMARY KEY,
    version_id TEXT NOT NULL,
    parent_version_id TEXT,
    device_id TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    deleted_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_node_sync_tombstones_created
    ON node_sync_tombstones (created_at, version_id)`
];
