import Database from 'better-sqlite3';

import { ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS } from '../../../lib/core/database/androidCompanionCoreSchemaStatements';
import { ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS } from '../../../lib/core/database/androidCompanionSyncSchemaStatements';

export function installCompanionNodeSchema(database: Database.Database) {
  database.exec(ANDROID_COMPANION_CORE_SCHEMA_STATEMENTS.join(';\n'));
  database.exec(ANDROID_COMPANION_SYNC_SCHEMA_STATEMENTS.join(';\n'));
  database.exec(`
    CREATE TABLE content_blobs (
      hash TEXT PRIMARY KEY, storage_key TEXT NOT NULL, kind TEXT NOT NULL,
      mime_type TEXT NOT NULL, compression TEXT NOT NULL,
      original_size_bytes INTEGER NOT NULL, stored_size_bytes INTEGER NOT NULL,
      original_sha256 TEXT NOT NULL, stored_sha256 TEXT NOT NULL,
      availability TEXT NOT NULL, created_at TEXT NOT NULL,
      cached_at TEXT, last_verified_at TEXT
    );
    CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB NOT NULL);
  `);
}

export function createFakeCapacitorConnection(database: Database.Database) {
  return {
    beginTransaction: async () => {
      database.exec('BEGIN');
    },
    commitTransaction: async () => {
      database.exec('COMMIT');
    },
    close: async () => undefined,
    execute: async (sql: string) => {
      database.exec(sql);
      const row = database.prepare('SELECT changes() AS count').get() as { count: number };
      return { changes: { changes: row.count } };
    },
    isDBOpen: async () => ({ result: false }),
    open: async () => undefined,
    query: async (sql: string, params: unknown[] = []) => ({
      values: database.prepare(sql).all(...decodeParams(params))
    }),
    rollbackTransaction: async () => {
      database.exec('ROLLBACK');
    },
    run: async (sql: string, params: unknown[] = []) => {
      const info = database.prepare(sql).run(...decodeParams(params));
      return { changes: { changes: info.changes, lastId: Number(info.lastInsertRowid) } };
    }
  };
}

function decodeParams(params: unknown[]) {
  return params.map((param) => {
    if (isBufferJson(param)) return Uint8Array.from(param.data);
    return param;
  });
}

function isBufferJson(value: unknown): value is { data: number[]; type: 'Buffer' } {
  return value !== null && typeof value === 'object' && 'type' in value && 'data' in value;
}
