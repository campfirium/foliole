// @vitest-environment node

import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY } from '../../lib/core/database/fullTextSearchIndexStrategy.js';

let mockedAppDataDir = '/tmp/foliole-workspace-search-sidecar-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection, resolveSearchDatabasePath } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { saveJsonSetting } from './settingsStore.js';
import { backupSqliteDatabase } from './sqliteBackupRestore.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workspace-search-sidecar-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('attaches the internal search sidecar next to the main database', async () => {
  const connection = openDatabaseConnection();
  expect(connection.searchDbPath).toBe(resolveSearchDatabasePath(connection.dbPath));
  await expect(fs.access(connection.searchDbPath)).resolves.toBeUndefined();
  expect(
    connection.sqlite
      .prepare("SELECT name FROM search.sqlite_master WHERE type = 'table' AND name = 'search_metadata'")
      .get()
  ).toEqual({ name: 'search_metadata' });
  expect(
    connection.sqlite
      .prepare("SELECT json_extract(value_json, '$.tokenizer') AS tokenizer FROM search.search_metadata WHERE key = 'schema'")
      .get()
  ).toEqual({ tokenizer: 'unicode61' });
});

it('recreates sidecar indexes when the search tokenizer setting changes on startup', () => {
  const connection = openDatabaseConnection();
  connection.sqlite
    .prepare('INSERT INTO search.node_search (title, path, content, node_id, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run('Old', '', 'old tokenizer row', 'old-node', '2026-05-26T00:00:00.000Z');
  saveJsonSetting('app_settings', { [FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]: 'cjk-trigram' });
  closeDatabaseConnection();

  initializeDatabase();
  const nextConnection = openDatabaseConnection();
  expect(
    nextConnection.sqlite
      .prepare("SELECT json_extract(value_json, '$.tokenizer') AS tokenizer FROM search.search_metadata WHERE key = 'schema'")
      .get()
  ).toEqual({ tokenizer: 'trigram' });
  expect(
    nextConnection.sqlite.prepare("SELECT COUNT(*) AS count FROM search.node_search WHERE node_id = 'old-node'").get()
  ).toEqual({ count: 0 });
});

it('keeps the internal search sidecar out of main database backups', async () => {
  const connection = openDatabaseConnection();
  const backupPath = path.join(tempRoot, 'backup.db');
  await backupSqliteDatabase({
    destinationPath: backupPath,
    sourceDatabase: connection.sqlite,
    sourcePath: connection.dbPath
  });

  const backup = openDetachedSqlite(backupPath);
  try {
    expect(
      backup.prepare("SELECT name FROM sqlite_master WHERE name = 'search_metadata'").get()
    ).toBeUndefined();
  } finally {
    backup.close();
  }
});

function openDetachedSqlite(databasePath: string) {
  return new BetterSqlite3(databasePath, { fileMustExist: true, readonly: true });
}
