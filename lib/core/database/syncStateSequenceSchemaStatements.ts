export const NEXT_SYNC_STATE_SEQ_SQL =
  '(SELECT high_water + 1 FROM sync_state_sequence WHERE singleton_id = 1)';

export const SYNC_STATE_SEQUENCE_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sync_state_sequence (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    source_epoch TEXT NOT NULL,
    high_water INTEGER NOT NULL CHECK (high_water >= 0)
  )`,
  `INSERT OR IGNORE INTO sync_state_sequence (singleton_id, source_epoch, high_water)
   SELECT 1, lower(hex(randomblob(16))), COALESCE(MAX(state_seq), 0) FROM sync_object_state`,
  `CREATE TRIGGER IF NOT EXISTS trg_sync_state_sequence_insert
   AFTER INSERT ON sync_object_state BEGIN
     UPDATE sync_state_sequence SET high_water = MAX(high_water, NEW.state_seq)
     WHERE singleton_id = 1;
   END`,
  `CREATE TRIGGER IF NOT EXISTS trg_sync_state_sequence_update
   AFTER UPDATE OF state_seq ON sync_object_state BEGIN
     UPDATE sync_state_sequence SET high_water = MAX(high_water, NEW.state_seq)
     WHERE singleton_id = 1;
   END`
] as const;
