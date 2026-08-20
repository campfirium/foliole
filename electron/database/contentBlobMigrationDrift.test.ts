// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-content-blob-migration-drift-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { migrateNumberedFixtureTo } from './numberedMigrationTestSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-content-blob-migration-drift-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('repairs v29 databases that have content_blobs but no body blob owner columns', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    INSERT INTO nodes (id, title, content, updated_at)
    VALUES ('node-1', 'Node 1', 'Node body after drift', '2026-04-27T00:00:00.000Z');

    CREATE TABLE external_documents (
      document_id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO external_documents (document_id, content, updated_at)
    VALUES ('doc-1', 'External body after drift', '2026-04-27T00:00:00.000Z');

    CREATE TABLE content_blobs (
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
      source_host_name TEXT,
      created_at TEXT NOT NULL,
      cached_at TEXT,
      last_verified_at TEXT
    );
  `);
  connection.sqlite.pragma('user_version = 29');

  migrateNumberedFixtureTo(connection.sqlite, 30);

  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(30);
  const node = connection.sqlite
    .prepare('SELECT body_blob_hash FROM nodes WHERE id = ?')
    .get('node-1') as { body_blob_hash: string } | undefined;
  const externalDocument = connection.sqlite
    .prepare('SELECT body_blob_hash FROM external_documents WHERE document_id = ?')
    .get('doc-1') as { body_blob_hash: string } | undefined;
  expect(node?.body_blob_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(externalDocument?.body_blob_hash).toMatch(/^[a-f0-9]{64}$/);

  const blobDataCount = connection.sqlite
    .prepare('SELECT COUNT(*) AS count FROM content_blob_data')
    .get() as { count: number };
  expect(blobDataCount.count).toBe(2);
});
