// Temporary transfer data lives with the receiving library, not in business tables.
export const SYNC_PACK_DEPENDENCY_STAGING_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sync_pack_dependency_transfers (
    group_id TEXT NOT NULL, peer_id TEXT NOT NULL, source_view_id TEXT NOT NULL,
    object_type TEXT NOT NULL, object_id TEXT NOT NULL, source_epoch TEXT NOT NULL,
    from_state_seq INTEGER NOT NULL, object_state_seq INTEGER NOT NULL,
    frontier_state_seq INTEGER NOT NULL, expected_rows INTEGER NOT NULL,
    expected_digest TEXT NOT NULL, next_row INTEGER NOT NULL,
    received_digest TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (group_id, peer_id, source_view_id, object_type, object_id)
  )`,
  `CREATE TABLE IF NOT EXISTS sync_pack_dependency_rows (
    group_id TEXT NOT NULL, peer_id TEXT NOT NULL, source_view_id TEXT NOT NULL,
    object_type TEXT NOT NULL, object_id TEXT NOT NULL, row_index INTEGER NOT NULL,
    table_name TEXT NOT NULL, key_json TEXT NOT NULL, payload_json TEXT NOT NULL,
    digest_after TEXT NOT NULL,
    PRIMARY KEY (group_id, peer_id, source_view_id, object_type, object_id, row_index),
    UNIQUE (group_id, peer_id, source_view_id, object_type, object_id, table_name, key_json)
  )`,
  `CREATE TABLE IF NOT EXISTS sync_pack_retired_source_views (
    group_id TEXT NOT NULL, peer_id TEXT NOT NULL, source_view_id TEXT NOT NULL,
    retired_at TEXT NOT NULL,
    PRIMARY KEY (group_id, peer_id, source_view_id)
  )`,
  `CREATE TABLE IF NOT EXISTS sync_pack_known_fact_claims (
    group_id TEXT NOT NULL, peer_id TEXT NOT NULL, source_view_id TEXT NOT NULL,
    kind TEXT NOT NULL, fact_key TEXT NOT NULL, fact_json TEXT NOT NULL,
    PRIMARY KEY (group_id, peer_id, source_view_id, kind, fact_key)
  )`
] as const;
