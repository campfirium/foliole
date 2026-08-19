import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../lib/core/sync/dbPort.js';
import { applySyncPackContentBlobsWithDbPort } from '../../lib/core/sync/syncPackContentBlobsExecutor.js';
import { PACK_SCHEMA } from '../../lib/core/sync/syncPackSchema.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

it('applies referenced content blob metadata and returns changed rows', async () => {
  const port = {
    run: vi.fn(async () => ({ changes: 2, lastInsertRowId: null }))
  } as unknown as DbPort;

  await expect(applySyncPackContentBlobsWithDbPort(port, { incomingAlias: 'incoming' })).resolves.toBe(2);
  expect(port.run).toHaveBeenCalledWith(expect.stringContaining('FROM incoming.content_blobs incoming'));
});

it('retains local body bytes when the same manifest returns in a sync pack', async () => {
  const sqlite = createFixture();
  const hash = 'd65c333f6cd8dc9582460d7e83e8204259b8bcf1538c1c7d8f2f2e40142449e1';
  try {
    seedLocalBody(sqlite, hash);
    seedIncomingManifest(sqlite, hash);
    await applySyncPackContentBlobsWithDbPort(createBetterSqliteDbPort(sqlite), {
      incomingAlias: 'incoming'
    });
    expect(sqlite.prepare(`SELECT blobs.availability, CAST(data.data AS TEXT) AS body
      FROM content_blobs blobs JOIN content_blob_data data ON data.hash = blobs.hash
      WHERE blobs.hash = ?`).get(hash)).toEqual({ availability: 'cached', body: 'C owner body' });
  } finally { sqlite.close(); }
});

function createFixture() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(`CREATE TABLE content_blobs (
    hash TEXT PRIMARY KEY, storage_key TEXT NOT NULL, kind TEXT NOT NULL, mime_type TEXT,
    compression TEXT NOT NULL, original_size_bytes INTEGER NOT NULL, stored_size_bytes INTEGER NOT NULL,
    original_sha256 TEXT NOT NULL, stored_sha256 TEXT NOT NULL, availability TEXT NOT NULL,
    source_host_name TEXT, created_at TEXT NOT NULL, cached_at TEXT, last_verified_at TEXT
  ); CREATE TABLE content_blob_data (
    hash TEXT PRIMARY KEY REFERENCES content_blobs(hash) ON DELETE CASCADE, data BLOB NOT NULL
  ); CREATE TABLE sync_object_state (
    object_type TEXT NOT NULL, object_id TEXT NOT NULL, content_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL, sync_dirty INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (object_type, object_id)
  ); ATTACH DATABASE ':memory:' AS incoming;`);
  for (const statement of PACK_SCHEMA) sqlite.exec(statement.replace(/^CREATE TABLE /u, 'CREATE TABLE incoming.'));
  return sqlite;
}

function seedLocalBody(sqlite: Database.Database, hash: string) {
  sqlite.prepare(`INSERT INTO content_blobs VALUES
    (?, ?, 'text_body', 'text/plain', 'none', 12, 12, ?, ?, 'local', 'c', ?, ?, ?)`)
    .run(hash, `text/${hash}`, hash, hash, '2026-08-13T05:25:12.731Z',
      '2026-08-13T05:25:12.731Z', '2026-08-13T05:25:12.731Z');
  sqlite.prepare('INSERT INTO content_blob_data VALUES (?, ?)').run(hash, Buffer.from('C owner body'));
}

function seedIncomingManifest(sqlite: Database.Database, hash: string) {
  sqlite.prepare(`INSERT INTO incoming.sync_object_state VALUES
    ('node', 'fact-c', 1, 'node-hash', 'desktop-host', '2026-08-13T05:25:12.731Z', NULL)`).run();
  sqlite.prepare(`INSERT INTO incoming.nodes
    (id, kind, title, body_blob_hash, created_at, updated_at) VALUES
    ('fact-c', 'topic', 'C fact', ?, '2026-08-13T05:25:12.731Z', '2026-08-13T05:25:12.731Z')`)
    .run(hash);
  sqlite.prepare(`INSERT INTO incoming.content_blobs VALUES
    (?, ?, 'text_body', 'text/plain', 'none', 12, 12, ?, ?, 'missing', 'c', ?, NULL, NULL)`)
    .run(hash, `text/${hash}`, hash, hash, '2026-08-13T05:25:12.731Z');
}
