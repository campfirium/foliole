// @vitest-environment node

import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY } from '../../lib/core/database/fullTextSearchIndexStrategy.js';
import { initializeWorkspaceSearchSidecar } from '../../lib/core/database/workspaceSearchSidecar.js';

let mockedAppDataDir = '/tmp/foliole-workspace-search-sidecar-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { createApplicationDatabaseBackup, restoreApplicationDatabaseBackup } from './backupRestore.js';
import { closeDatabaseConnection, openDatabaseConnection, resolveSearchDatabasePath } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { saveJsonSetting } from './settingsStore.js';
import { backupSqliteDatabase } from './sqliteBackupRestore.js';
import { searchWorkspace } from './workspaceSearch.js';

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

it('rebuilds when metadata survives but sidecar FTS tables are missing', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec(`CREATE VIRTUAL TABLE main.node_search USING fts5(
    title,
    path,
    content,
    node_id UNINDEXED,
    updated_at UNINDEXED,
    tokenize = 'trigram'
  )`);
  connection.sqlite
    .prepare('INSERT INTO main.node_search (title, path, content, node_id, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run('Old main', '', 'main stale marker', 'main-stale-node', '2026-05-26T00:00:00.000Z');
  connection.sqlite.exec('DROP TABLE search.node_search');
  closeDatabaseConnection();

  initializeDatabase();
  const nextConnection = openDatabaseConnection();

  expect(
    nextConnection.sqlite.prepare("SELECT name FROM search.sqlite_master WHERE type = 'table' AND name = 'node_search'").get()
  ).toEqual({ name: 'node_search' });
  expect(
    nextConnection.sqlite.prepare("SELECT COUNT(*) AS count FROM search.node_search WHERE node_id = 'main-stale-node'").get()
  ).toEqual({ count: 0 });
});

it('retries a previous failed rebuild instead of marking it ready without rebuilding', () => {
  const connection = openDatabaseConnection();
  connection.sqlite
    .prepare(
      `INSERT INTO search.search_metadata (key, value_json, updated_at)
       VALUES ('last_rebuild_status', ?, '2026-05-26T00:00:00.000Z')
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`
    )
    .run(JSON.stringify({ status: 'failed', tokenizer: 'unicode61' }));
  connection.sqlite.exec('DROP TABLE search.node_search');
  closeDatabaseConnection();

  initializeDatabase();
  const nextConnection = openDatabaseConnection();

  expect(
    nextConnection.sqlite.prepare("SELECT name FROM search.sqlite_master WHERE type = 'table' AND name = 'node_search'").get()
  ).toEqual({ name: 'node_search' });
  expect(readLastRebuildStatus(nextConnection.sqlite)).toMatchObject({ status: 'ready' });
});

it('records failed status without rejecting the opened connection when sidecar rebuild fails after attach', () => {
  const connection = openDatabaseConnection();
  connection.sqlite.exec('DROP TABLE search.node_search');

  expect(() =>
    initializeWorkspaceSearchSidecar(connection, {
      rebuildWorkspaceSearchIndexes: () => {
        throw new Error('sidecar rebuild boom');
      }
    })
  ).not.toThrow();
  expect(readLastRebuildStatus(connection.sqlite)).toMatchObject({
    error: 'sidecar rebuild boom',
    status: 'failed'
  });
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

it('rebuilds the internal search sidecar from restored main data when the sidecar file is missing', async () => {
  seedSearchNode('restore-search-node', '# Restored\nunique restored needle');
  const backup = await createApplicationDatabaseBackup();

  seedSearchNode('restore-search-node', '# Mutated\nunique mutated needle');
  await restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath });

  const searchDbPath = openDatabaseConnection().searchDbPath;
  closeDatabaseConnection();
  await fs.rm(searchDbPath, { force: true });

  initializeDatabase();

  expect(searchWorkspace('restored').find((result) => result.id === 'restore-search-node')).toMatchObject({
    id: 'restore-search-node',
    kind: 'node',
    title: 'restore-search-node'
  });
  expect(searchWorkspace('mutated').find((result) => result.id === 'restore-search-node')).toBeUndefined();
});

function openDetachedSqlite(databasePath: string) {
  return new BetterSqlite3(databasePath, { fileMustExist: true, readonly: true });
}

function readLastRebuildStatus(sqlite: import('better-sqlite3').Database) {
  const row = sqlite
    .prepare("SELECT value_json FROM search.search_metadata WHERE key = 'last_rebuild_status'")
    .get() as { value_json: string };
  return JSON.parse(row.value_json) as Record<string, unknown>;
}

function seedSearchNode(nodeId: string, content: string) {
  upsertNodeSnapshot({
    nodeId,
    parentNodeId: null,
    kind: 'topic',
    title: nodeId,
    isTitleManual: true,
    content,
    reveal: null,
    anchorLink: null,
    position: 0,
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z'
  });
}
