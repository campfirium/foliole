export const NODE_VERSION_MEMBER_POSITION_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS node_version_member_positions (
    fact_id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    device_identity_key TEXT NOT NULL,
    object_id TEXT NOT NULL,
    library_epoch TEXT NOT NULL,
    proof_revision INTEGER NOT NULL,
    adopted_version_id TEXT NOT NULL,
    pending_version_ids_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    resolved_revision INTEGER,
    UNIQUE (group_id, device_identity_key, object_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_node_version_member_positions_object
    ON node_version_member_positions (object_id, group_id)`
] as const;
