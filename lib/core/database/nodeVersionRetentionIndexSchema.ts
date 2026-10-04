/** Parent and anchor lookups used when proving retained original version facts. */
export const NODE_VERSION_RETENTION_INDEX_SCHEMA = [
  `CREATE INDEX IF NOT EXISTS idx_node_sync_versions_object_created
    ON node_sync_versions (object_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_node_sync_versions_parent
    ON node_sync_versions (parent_version_id)`,
  `CREATE INDEX IF NOT EXISTS idx_node_sync_version_parents_parent
    ON node_sync_version_parents (parent_version_id)`,
  `CREATE INDEX IF NOT EXISTS idx_nodes_anchor_source_version
    ON nodes (anchor_source_version_id)`
] as const;
