export const FRAMED_SYNC_COMPLETION_SCHEMA = `CREATE TABLE IF NOT EXISTS framed_sync_completion_windows (
  transfer_id BLOB PRIMARY KEY, completed_at INTEGER NOT NULL CHECK (completed_at >= 0))`;

export const FRAMED_SYNC_COMPLETION_BACKFILL = `INSERT OR IGNORE INTO framed_sync_completion_windows
  SELECT transfer_id, strftime('%s', 'now') * 1000 FROM framed_sync_receipts
  UNION SELECT transfer_id, strftime('%s', 'now') * 1000
  FROM framed_sync_outbound_publications WHERE state != 'published'`;
