export const SYNC_IDENTITY_INDEX_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sync_identity_index_meta (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    backfill_complete INTEGER NOT NULL DEFAULT 0 CHECK (backfill_complete IN (0, 1)),
    last_object_type TEXT,
    last_object_id TEXT
  )`,
  `INSERT OR IGNORE INTO sync_identity_index_meta (singleton_id) VALUES (1)`,
  `CREATE TABLE IF NOT EXISTS sync_identity_index_rows (
    object_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    partition INTEGER NOT NULL CHECK (partition BETWEEN 0 AND 255),
    fingerprint TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (object_type, object_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sync_identity_index_partition
    ON sync_identity_index_rows (partition, object_type, object_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sync_identity_index_updated
    ON sync_identity_index_rows (updated_at, object_type, object_id)`,
  `CREATE TABLE IF NOT EXISTS sync_identity_partition_digest (
    partition INTEGER PRIMARY KEY CHECK (partition BETWEEN 0 AND 255),
    digest TEXT,
    row_count INTEGER NOT NULL CHECK (row_count >= 0)
  )`,
  `CREATE TABLE IF NOT EXISTS sync_identity_dirty_keys (
    object_type TEXT NOT NULL,
    object_id TEXT NOT NULL,
    PRIMARY KEY (object_type, object_id)
  )`,
  `CREATE TRIGGER IF NOT EXISTS trg_sync_identity_state_insert
   AFTER INSERT ON sync_object_state BEGIN
     INSERT INTO sync_identity_dirty_keys (object_type, object_id)
       SELECT NEW.object_type, NEW.object_id WHERE NOT EXISTS (
         SELECT 1 FROM sync_identity_dirty_keys
         WHERE object_type = NEW.object_type AND object_id = NEW.object_id
       );
   END`,
  `CREATE TRIGGER IF NOT EXISTS trg_sync_identity_state_update
   AFTER UPDATE OF object_type, object_id, state_seq, current_version_id,
     content_hash, updated_at, deleted_at ON sync_object_state BEGIN
     INSERT INTO sync_identity_dirty_keys (object_type, object_id)
       SELECT OLD.object_type, OLD.object_id WHERE NOT EXISTS (
         SELECT 1 FROM sync_identity_dirty_keys
         WHERE object_type = OLD.object_type AND object_id = OLD.object_id
       );
     INSERT INTO sync_identity_dirty_keys (object_type, object_id)
       SELECT NEW.object_type, NEW.object_id WHERE NOT EXISTS (
         SELECT 1 FROM sync_identity_dirty_keys
         WHERE object_type = NEW.object_type AND object_id = NEW.object_id
       );
   END`,
  `CREATE TRIGGER IF NOT EXISTS trg_sync_identity_state_delete
   AFTER DELETE ON sync_object_state BEGIN
     INSERT INTO sync_identity_dirty_keys (object_type, object_id)
       SELECT OLD.object_type, OLD.object_id WHERE NOT EXISTS (
         SELECT 1 FROM sync_identity_dirty_keys
         WHERE object_type = OLD.object_type AND object_id = OLD.object_id
       );
   END`
] as const;
