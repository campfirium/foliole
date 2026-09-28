export const SYNC_PACK_PROGRESS_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sync_pack_receive_progress (
    group_id TEXT NOT NULL,
    peer_id TEXT NOT NULL,
    source_epoch TEXT NOT NULL,
    cursor_state_seq INTEGER NOT NULL CHECK (cursor_state_seq >= 0),
    frontier_state_seq INTEGER NOT NULL CHECK (frontier_state_seq >= cursor_state_seq),
    restore_id TEXT,
    completed INTEGER NOT NULL CHECK (completed IN (0, 1)),
    updated_at TEXT NOT NULL,
    PRIMARY KEY (group_id, peer_id)
  )`,
  `CREATE TABLE IF NOT EXISTS sync_pack_retired_source_epochs (
    group_id TEXT NOT NULL,
    peer_id TEXT NOT NULL,
    source_epoch TEXT NOT NULL,
    retired_at TEXT NOT NULL,
    PRIMARY KEY (group_id, peer_id, source_epoch)
  )`,
  `CREATE TABLE IF NOT EXISTS sync_pack_resource_articles (
    group_id TEXT NOT NULL,
    peer_id TEXT NOT NULL,
    article_id TEXT NOT NULL,
    PRIMARY KEY (group_id, peer_id, article_id)
  )`
] as const;
