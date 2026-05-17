export const SEARCH_INDEX_INVALIDATION_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS search_index_invalidations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invalidation_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    claimed_at TEXT,
    completed_at TEXT,
    CHECK (invalidation_type IN (
      'node_workspace',
      'node_pdf',
      'attachment_pdf',
      'node_subtree_path',
      'node_subtree_deleted',
      'node_subtree_restored'
    )),
    CHECK (status IN ('pending', 'running', 'failed', 'completed'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_search_index_invalidations_pending
    ON search_index_invalidations (invalidation_type, target_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_search_index_invalidations_claim
    ON search_index_invalidations (status, updated_at, id)`
];
