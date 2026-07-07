export const ASSISTANT_THREAD_INDEX_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS assistant_thread_index (
    provider TEXT NOT NULL,
    provider_thread_id TEXT NOT NULL,
    location_type TEXT NOT NULL,
    location_node_id TEXT,
    title TEXT NOT NULL,
    preview TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    read_state TEXT NOT NULL DEFAULT 'not_requested',
    read_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_opened_at TEXT NOT NULL,
    archived_at TEXT,
    deleted_at TEXT,
    PRIMARY KEY (provider, provider_thread_id),
    CHECK (location_type IN ('node', 'workspace')),
    CHECK (status IN ('active', 'archived', 'deleted')),
    CHECK (read_state IN ('not_requested', 'available', 'failed')),
    CHECK (location_type != 'node' OR location_node_id IS NOT NULL),
    CHECK (location_type != 'workspace' OR location_node_id IS NULL)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_assistant_thread_index_location
    ON assistant_thread_index (location_type, location_node_id, updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_assistant_thread_index_status_updated
    ON assistant_thread_index (status, updated_at)`
];
