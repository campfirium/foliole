// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-content-blob-migration-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { DATABASE_SCHEMA_VERSION, initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-content-blob-migration-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('applies content blob migrations to existing v28 databases', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    INSERT INTO nodes (id, title, content, updated_at)
    VALUES ('node-1', 'Node 1', 'Long body text', '2026-04-27T00:00:00.000Z');

    CREATE TABLE external_documents (
      document_id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    INSERT INTO external_documents (document_id, content, updated_at)
    VALUES ('doc-1', 'External body text', '2026-04-27T00:00:00.000Z');
  `);
  connection.sqlite.pragma('user_version = 28');

  initializeDatabaseConnection(connection);

  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  const contentBlobTable = connection.sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'content_blobs'")
    .get() as { name: string } | undefined;
  expect(contentBlobTable).toEqual({ name: 'content_blobs' });
  const nodeColumns = connection.sqlite.prepare('PRAGMA table_info(nodes)').all() as Array<{ name: string }>;
  const externalColumns = connection.sqlite.prepare('PRAGMA table_info(external_documents)').all() as Array<{ name: string }>;
  expect(nodeColumns.map((column) => column.name)).toContain('body_blob_hash');
  expect(externalColumns.map((column) => column.name)).toContain('body_blob_hash');
  expect(connection.sqlite
    .prepare('SELECT body_blob_hash FROM nodes WHERE id = ?')
    .get('node-1')).toMatchObject({ body_blob_hash: expect.stringMatching(/^[a-f0-9]{64}$/) });
  expect(connection.sqlite
    .prepare('SELECT body_blob_hash FROM external_documents WHERE document_id = ?')
    .get('doc-1')).toMatchObject({ body_blob_hash: expect.stringMatching(/^[a-f0-9]{64}$/) });
  expect(connection.sqlite
    .prepare("SELECT COUNT(*) AS count FROM content_blobs WHERE kind = 'text_body' AND availability = 'local'")
    .get()).toEqual({ count: 2 });
  expect(connection.sqlite.prepare('SELECT COUNT(*) AS count FROM content_blob_data').get()).toEqual({ count: 2 });
});
