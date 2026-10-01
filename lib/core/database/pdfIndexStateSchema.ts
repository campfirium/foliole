/** Rebuildable local processing state, not a resource inventory or a sync object. */
export const PDF_INDEX_STATE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS pdf_index_state (
    attachment_id TEXT PRIMARY KEY,
    status TEXT, indexed_at TEXT, error TEXT, version INTEGER, attempt INTEGER
  )`
] as const;
