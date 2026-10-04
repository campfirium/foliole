export const SYNC_IDENTITY_FACT_STAGING_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sync_identity_fact_staging (
    group_id TEXT NOT NULL,
    source_peer_id TEXT NOT NULL,
    source_view_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    fact_digest TEXT NOT NULL,
    section TEXT NOT NULL CHECK (section IN ('versions', 'parents', 'reviews')),
    fact_key TEXT NOT NULL,
    row_json TEXT NOT NULL,
    PRIMARY KEY (group_id, source_peer_id, source_view_id, node_id, section, fact_key)
  )`,
  `CREATE TABLE IF NOT EXISTS sync_identity_fact_sections (
    group_id TEXT NOT NULL,
    source_peer_id TEXT NOT NULL,
    source_view_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    fact_digest TEXT NOT NULL,
    section TEXT NOT NULL,
    last_key TEXT,
    complete INTEGER NOT NULL CHECK (complete IN (0, 1)),
    PRIMARY KEY (group_id, source_peer_id, source_view_id, node_id, section)
  )`
] as const;
