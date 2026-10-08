import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

export const packHash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export const packTime = '2026-10-07T00:00:00.000Z';

export function contentPackFixture(bodies: readonly string[]) {
  const directory = mkdtempSync(join(tmpdir(), 'foliole-content-pack-'));
  const path = join(directory, 'native-pack.sqlite');
  const pack = new Database(path);
  pack.exec('CREATE TABLE content_blob_batch (hash TEXT PRIMARY KEY, size_bytes INTEGER NOT NULL, data BLOB NOT NULL)');
  const sqlite = new Database(':memory:');
  initializeDatabaseConnection({ sqlite });
  const entries = bodies.map((body) => {
    const bytes = Buffer.from(body);
    const hash = packHash(bytes);
    pack.prepare('INSERT INTO content_blob_batch VALUES (?, ?, ?)').run(hash, bytes.length, bytes);
    sqlite.prepare(`INSERT INTO content_blobs (hash, storage_key, kind, mime_type, compression,
      original_size_bytes, stored_size_bytes, original_sha256, stored_sha256, availability, created_at)
      VALUES (?, ?, 'text_body', 'text/plain', 'none', ?, ?, ?, ?, 'missing', ?)`)
      .run(hash, `text/${hash}`, bytes.length, bytes.length, hash, hash, packTime);
    return { body, bytes, hash };
  });
  pack.close();
  const db = createBetterSqliteDbPort(sqlite);
  return { sqlite, db, entries, path,
    close() { sqlite.close(); rmSync(directory, { recursive: true, force: true }); } };
}
