import { createHash } from 'node:crypto';

import Database from 'better-sqlite3';

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

export const packHash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export const packTime = '2026-10-07T00:00:00.000Z';

export function contentPackFixture(bodies: readonly string[]) {
  const sqlite = new Database(':memory:');
  initializeDatabaseConnection({ sqlite });
  const entries = bodies.map((body) => {
    const bytes = Buffer.from(body);
    const hash = packHash(bytes);
    sqlite.prepare(`INSERT INTO content_blobs (hash, storage_key, kind, mime_type, compression,
      original_size_bytes, stored_size_bytes, original_sha256, stored_sha256, availability, created_at)
      VALUES (?, ?, 'text_body', 'text/plain', 'none', ?, ?, ?, ?, 'missing', ?)`)
      .run(hash, `text/${hash}`, bytes.length, bytes.length, hash, hash, packTime);
    return { body, bytes, hash };
  });
  const db = createBetterSqliteDbPort(sqlite);
  return { sqlite, db, entries,
    close() { sqlite.close(); } };
}
