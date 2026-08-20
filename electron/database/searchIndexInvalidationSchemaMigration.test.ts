// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-search-index-invalidation-schema-tests';

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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-search-index-invalidation-schema-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('migrates v40 invalidation queues to accept subtree task types', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec(`
    CREATE TABLE search_index_invalidations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invalidation_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      claimed_at TEXT,
      completed_at TEXT,
      CHECK (invalidation_type IN ('node_workspace', 'node_pdf', 'attachment_pdf')),
      CHECK (status IN ('pending', 'running', 'failed', 'completed'))
    );
    INSERT INTO search_index_invalidations (
      invalidation_type, target_id, status, attempts, last_error, created_at, updated_at, claimed_at, completed_at
    ) VALUES ('node_workspace', 'node-old', 'pending', 0, NULL, '2026-05-16T10:00:00.000Z', '2026-05-16T10:00:00.000Z', NULL, NULL);
  `);
  connection.sqlite.pragma('user_version = 40');

  migrateNumberedFixtureTo(connection.sqlite, 41);

  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(41);
  expect(connection.sqlite.prepare('SELECT invalidation_type, target_id FROM search_index_invalidations').get()).toEqual({
    invalidation_type: 'node_workspace',
    target_id: 'node-old'
  });
  expect(() =>
    connection.sqlite
      .prepare(
        `INSERT INTO search_index_invalidations (
          invalidation_type, target_id, created_at, updated_at
        ) VALUES ('node_subtree_path', 'node-new', '2026-05-16T10:01:00.000Z', '2026-05-16T10:01:00.000Z')`
      )
      .run()
  ).not.toThrow();
});
