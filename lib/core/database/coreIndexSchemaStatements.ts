export const CORE_INDEX_NAMES = [
  'idx_nodes_parent_id',
  'idx_nodes_dirty_or_unversioned_updated',
  'idx_nodes_deleted_at',
  'idx_nodes_body_blob_hash',
  'idx_node_review_due',
  'idx_node_reading_state_next_at',
  'idx_review_log_node_id',
  'idx_review_log_reviewed_at_op',
  'idx_review_log_device_id'
] as const;

export const CORE_INDEX_SCHEMA_STATEMENTS = [
  'CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON nodes (parent_id)',
  `CREATE INDEX IF NOT EXISTS idx_nodes_dirty_or_unversioned_updated
    ON nodes (updated_at)
    WHERE sync_dirty = 1 OR current_version_id IS NULL`,
  'CREATE INDEX IF NOT EXISTS idx_nodes_deleted_at ON nodes (deleted_at)',
  `CREATE INDEX IF NOT EXISTS idx_nodes_body_blob_hash
    ON nodes (body_blob_hash)
    WHERE body_blob_hash IS NOT NULL`,
  'CREATE INDEX IF NOT EXISTS idx_node_review_due ON node_review (due)',
  'CREATE INDEX IF NOT EXISTS idx_node_reading_state_next_at ON node_reading (state, next_at)',
  'CREATE INDEX IF NOT EXISTS idx_review_log_node_id ON review_log (node_id)',
  'CREATE INDEX IF NOT EXISTS idx_review_log_reviewed_at_op ON review_log (reviewed_at, op_id)',
  'CREATE INDEX IF NOT EXISTS idx_review_log_device_id ON review_log (device_id)'
] as const;
