// @vitest-environment node

import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-main-fts-cleanup-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { cleanupMainFtsTables, listLegacyMainFtsObjectNames } from './mainFtsCleanup.js';
import { initializeDatabase } from './migrate.js';
import { backupSqliteDatabase } from './sqliteBackupRestore.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-main-fts-cleanup-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('drops legacy main FTS tables and their shadow tables after creating a snapshot', async () => {
  const connection = openDatabaseConnection();
  createLegacyMainFtsTables(connection.sqlite);
  seedSidecarMarker(connection.sqlite);
  const beforeObjects = listLegacyMainFtsObjectNames(connection.sqlite);

  const result = cleanupMainFtsTables({
    now: new Date('2026-05-26T00:00:00.000Z'),
    sourceDatabase: connection.sqlite,
    sourcePath: connection.dbPath
  });

  expect(result.status).toBe('cleaned');
  expect(result.droppedTables).toEqual(['node_search', 'pdf_search']);
  expect(result.legacyObjectNamesBefore).toEqual(beforeObjects);
  expect(result.legacyObjectNamesAfter).toEqual([]);
  expect(result.snapshot?.destinationPath).toContain('pre-cleanup-2026-05-26_00-00-00-000.db');
  expect(result.vacuumed).toBe(true);
  expect(result.pageCountAfterVacuum).toBeLessThan(result.pageCountBeforeVacuum ?? 0);
  expect(listLegacyMainFtsObjectNames(connection.sqlite)).toEqual([]);
  expect(readSidecarMarker(connection.sqlite)).toEqual({ title: 'Sidecar marker' });

  const snapshot = openDetachedSqlite(result.snapshot?.destinationPath ?? '');
  try {
    expect(listLegacyMainFtsObjectNames(snapshot)).toEqual(beforeObjects);
  } finally {
    snapshot.close();
  }
});

it('returns already-clean without creating a snapshot when legacy main FTS is absent', async () => {
  const connection = openDatabaseConnection();

  const result = cleanupMainFtsTables({
    now: new Date('2026-05-26T00:00:00.000Z'),
    sourceDatabase: connection.sqlite,
    sourcePath: connection.dbPath
  });

  expect(result).toMatchObject({
    droppedTables: [],
    legacyObjectNamesAfter: [],
    legacyObjectNamesBefore: [],
    pageCountAfterVacuum: null,
    pageCountBeforeVacuum: null,
    snapshot: null,
    status: 'already-clean',
    vacuumed: false
  });
});

it('can skip vacuum while reporting that the main file may not have shrunk', () => {
  const connection = openDatabaseConnection();
  createLegacyMainFtsTables(connection.sqlite);

  const result = cleanupMainFtsTables({
    sourceDatabase: connection.sqlite,
    sourcePath: connection.dbPath,
    vacuum: false
  });

  expect(result.status).toBe('cleaned');
  expect(result.legacyObjectNamesAfter).toEqual([]);
  expect(result.pageCountBeforeVacuum).toBeGreaterThan(0);
  expect(result.pageCountAfterVacuum).toBeNull();
  expect(result.vacuumed).toBe(false);
});

it('keeps sidecar out of backups while legacy main FTS disappears after cleanup', async () => {
  const connection = openDatabaseConnection();
  createLegacyMainFtsTables(connection.sqlite);
  seedSidecarMarker(connection.sqlite);

  const beforeCleanupBackupPath = path.join(tempRoot, 'before-cleanup.db');
  await backupSqliteDatabase({
    destinationPath: beforeCleanupBackupPath,
    sourceDatabase: connection.sqlite,
    sourcePath: connection.dbPath
  });
  const beforeCleanupBackup = openDetachedSqlite(beforeCleanupBackupPath);
  try {
    expect(listLegacyMainFtsObjectNames(beforeCleanupBackup)).not.toEqual([]);
    expect(beforeCleanupBackup.prepare("SELECT name FROM sqlite_master WHERE name = 'search_metadata'").get()).toBeUndefined();
  } finally {
    beforeCleanupBackup.close();
  }

  cleanupMainFtsTables({
    sourceDatabase: connection.sqlite,
    sourcePath: connection.dbPath
  });

  const afterCleanupBackupPath = path.join(tempRoot, 'after-cleanup.db');
  await backupSqliteDatabase({
    destinationPath: afterCleanupBackupPath,
    sourceDatabase: connection.sqlite,
    sourcePath: connection.dbPath
  });
  const afterCleanupBackup = openDetachedSqlite(afterCleanupBackupPath);
  try {
    expect(listLegacyMainFtsObjectNames(afterCleanupBackup)).toEqual([]);
    expect(afterCleanupBackup.prepare("SELECT name FROM sqlite_master WHERE name = 'search_metadata'").get()).toBeUndefined();
  } finally {
    afterCleanupBackup.close();
  }
});

function createLegacyMainFtsTables(sqlite: import('better-sqlite3').Database) {
  sqlite.exec(`
    CREATE VIRTUAL TABLE main.node_search USING fts5(
      title,
      path,
      content,
      node_id UNINDEXED,
      updated_at UNINDEXED,
      tokenize = 'trigram'
    );
    CREATE VIRTUAL TABLE main.pdf_search USING fts5(
      title,
      path,
      text,
      node_id UNINDEXED,
      attachment_id UNINDEXED,
      page UNINDEXED,
      updated_at UNINDEXED,
      page_text_length UNINDEXED,
      tokenize = 'trigram'
    );
  `);
  const largeContent = 'legacy searchable body '.repeat(80);
  const insertNode = sqlite.prepare(
    'INSERT INTO main.node_search (title, path, content, node_id, updated_at) VALUES (?, ?, ?, ?, ?)'
  );
  const insertPdf = sqlite.prepare(
    'INSERT INTO main.pdf_search (title, path, text, node_id, attachment_id, page, updated_at, page_text_length) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (let index = 0; index < 36; index += 1) {
    insertNode.run(`Legacy ${index}`, '', largeContent, `node-${index}`, '2026-05-26T00:00:00.000Z');
    insertPdf.run(
      `Legacy PDF ${index}`,
      '',
      largeContent,
      `node-${index}`,
      `attachment-${index}`,
      '1',
      '2026-05-26T00:00:00.000Z',
      String(largeContent.length)
    );
  }
}

function seedSidecarMarker(sqlite: import('better-sqlite3').Database) {
  sqlite
    .prepare('INSERT INTO search.node_search (title, path, content, node_id, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run('Sidecar marker', '', 'sidecar survives cleanup', 'sidecar-node', '2026-05-26T00:00:00.000Z');
}

function readSidecarMarker(sqlite: import('better-sqlite3').Database) {
  return sqlite.prepare("SELECT title FROM search.node_search WHERE node_id = 'sidecar-node'").get();
}

function openDetachedSqlite(databasePath: string) {
  return new BetterSqlite3(databasePath, { fileMustExist: true, readonly: true });
}
