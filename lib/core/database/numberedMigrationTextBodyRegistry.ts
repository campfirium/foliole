import type { DatabaseMigrationTarget } from './migrationTypes.js';
import { addColumnIfMissing } from './numberedMigrationHelpers.js';
import {
  backfillTextBodyBlobData,
  backfillTextBodyBlobOwners
} from './numberedMigrationTextBodyBackfill.js';

export const TEXT_BODY_NUMBERED_MIGRATIONS: Array<{ migrate: (sqlite: DatabaseMigrationTarget) => void; version: number }> = [
  {
    version: 29,
    migrate: (sqlite) => {
      sqlite.exec(`CREATE TABLE IF NOT EXISTS content_blobs (
        hash TEXT PRIMARY KEY,
        storage_key TEXT NOT NULL,
        kind TEXT NOT NULL,
        mime_type TEXT,
        compression TEXT NOT NULL DEFAULT 'none',
        original_size_bytes INTEGER NOT NULL,
        stored_size_bytes INTEGER NOT NULL,
        original_sha256 TEXT NOT NULL,
        stored_sha256 TEXT NOT NULL,
        availability TEXT NOT NULL DEFAULT 'missing',
        source_device_id TEXT,
        created_at TEXT NOT NULL,
        cached_at TEXT,
        last_verified_at TEXT
      )`);
      sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_content_blobs_availability
        ON content_blobs (availability)`);
      sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_content_blobs_kind
        ON content_blobs (kind)`);
      addColumnIfMissing(sqlite, 'nodes', 'body_blob_hash', 'TEXT');
      addColumnIfMissing(sqlite, 'external_documents', 'body_blob_hash', 'TEXT');
      backfillTextBodyBlobOwners(sqlite);
    }
  },
  {
    version: 30,
    migrate: (sqlite) => {
      sqlite.exec(`CREATE TABLE IF NOT EXISTS content_blob_data (
        hash TEXT PRIMARY KEY REFERENCES content_blobs(hash) ON DELETE CASCADE,
        data BLOB NOT NULL
      )`);
      addColumnIfMissing(sqlite, 'nodes', 'body_blob_hash', 'TEXT');
      addColumnIfMissing(sqlite, 'external_documents', 'body_blob_hash', 'TEXT');
      backfillTextBodyBlobOwners(sqlite);
      backfillTextBodyBlobData(sqlite, { bodyHashColumn: 'body_blob_hash', contentColumn: 'content', tableName: 'nodes' });
      backfillTextBodyBlobData(sqlite, { bodyHashColumn: 'body_blob_hash', contentColumn: 'content', tableName: 'external_documents' });
    }
  }
];
