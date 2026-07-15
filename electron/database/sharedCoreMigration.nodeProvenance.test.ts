// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-node-provenance-migration-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { DATABASE_SCHEMA_VERSION, initializeDatabaseConnection } from '../../lib/core/database/migrations.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-node-provenance-migration-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('backfills only the latest provable landed import while upgrading schema 54', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec(`
    CREATE TABLE nodes (
      id TEXT PRIMARY KEY,
      sync_dirty INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE import_runs (
      id TEXT PRIMARY KEY,
      node_id TEXT,
      source_fingerprint TEXT NOT NULL,
      content_fingerprint TEXT NOT NULL,
      result_status TEXT NOT NULL,
      degraded_reason TEXT,
      imported_at TEXT NOT NULL
    );
    INSERT INTO nodes (id) VALUES ('node-success'), ('node-failed'), ('node-empty');
    INSERT INTO import_runs VALUES
      ('run-old', 'node-success', 'source-a', 'content-old', 'imported', NULL, '2026-07-15T00:00:00.000Z'),
      ('run-new', 'node-success', 'source-a', 'content-new', 'degraded', 'image_warning', '2026-07-15T01:00:00.000Z'),
      ('run-failed', 'node-failed', 'source-b', 'content-b', 'failed', NULL, '2026-07-15T02:00:00.000Z'),
      ('run-empty', 'node-empty', 'source-c', 'content-c', 'degraded', 'empty_content', '2026-07-15T03:00:00.000Z');
  `);
  connection.sqlite.pragma('user_version = 54');

  initializeDatabaseConnection(connection);

  expect(connection.sqlite.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  expect(connection.sqlite.prepare(
    `SELECT id, import_source_fingerprint, import_content_fingerprint, sync_dirty
     FROM nodes ORDER BY id`
  ).all()).toEqual([
    { id: 'node-empty', import_content_fingerprint: null, import_source_fingerprint: null, sync_dirty: 0 },
    { id: 'node-failed', import_content_fingerprint: null, import_source_fingerprint: null, sync_dirty: 0 },
    { id: 'node-success', import_content_fingerprint: 'content-new', import_source_fingerprint: 'source-a', sync_dirty: 1 }
  ]);
});
