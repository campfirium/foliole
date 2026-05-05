// @vitest-environment node

import nodeFs from 'node:fs';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

let mockedAppDataDir = '/tmp/foliole-library-migration-app-data';
let mockedDocumentsDir = '/tmp/foliole-library-migration-documents';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    documents_dir: mockedDocumentsDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, resolveDatabasePath } from './connection.js';
import { initializeDatabase, runDatabaseMigrations } from './migrate.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-library-migration-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  mockedDocumentsDir = path.join(tempRoot, 'Documents');
});

afterEach(async () => {
  closeDatabaseConnection();
  vi.restoreAllMocks();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function createLegacyDatabase() {
  const legacyDatabasePath = path.join(mockedAppDataDir, 'foliole.db');
  nodeFs.mkdirSync(path.dirname(legacyDatabasePath), { recursive: true });
  const sqlite = new BetterSqlite3(legacyDatabasePath);
  runDatabaseMigrations(sqlite);
  sqlite
    .prepare(
      `INSERT INTO nodes (
         id,
         parent_id,
         title,
         is_title_manual,
         hide_title_heading,
         content,
         reveal,
         anchor_link,
         created_at,
         updated_at,
         deleted_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run('legacy-node', null, 'Legacy Node', 1, 0, '', null, null, '2026-03-30T00:00:00.000Z', '2026-03-30T00:00:00.000Z', null);
  sqlite.close();
  return legacyDatabasePath;
}

it('keeps using the library home even when legacy AppData data still exists', async () => {
  const legacyDatabasePath = createLegacyDatabase();
  const libraryDatabasePath = path.join(mockedDocumentsDir, 'Foliole', 'Data', 'foliole.db');

  const connection = initializeDatabase();

  expect(connection.dbPath).toBe(libraryDatabasePath);
  expect(resolveDatabasePath()).toBe(libraryDatabasePath);
  expect(connection.sqlite.prepare('SELECT title FROM nodes WHERE id = ?').pluck().get('legacy-node')).toBeUndefined();
  await expect(fs.readFile(legacyDatabasePath, 'utf8')).resolves.toBeTruthy();
  await expect(fs.access(path.join(mockedDocumentsDir, 'Foliole', 'Assets'))).resolves.toBeUndefined();
});
