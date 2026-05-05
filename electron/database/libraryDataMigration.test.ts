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
import { resolveMigrationStatusFileForTest } from './libraryDataMigration.js';
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
  sqlite
    .prepare('INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?)')
    .run('legacy-attachment', 'legacy.png', 'image/png', 11, '2026-03-30T00:00:00.000Z');
  sqlite.prepare('INSERT INTO node_attachments (node_id, attachment_id, role) VALUES (?, ?, ?)').run(
    'legacy-node',
    'legacy-attachment',
    'image'
  );
  sqlite.close();
  return legacyDatabasePath;
}

it('migrates the legacy AppData database and attachments into the library home and keeps using it after restart', async () => {
  const legacyDatabasePath = createLegacyDatabase();
  const legacyAttachmentPath = path.join(mockedAppDataDir, 'legacy-attachment');
  const libraryDatabasePath = path.join(mockedDocumentsDir, 'Foliole', 'Data', 'foliole.db');
  const libraryAttachmentPath = path.join(mockedDocumentsDir, 'Foliole', 'Assets', 'legacy-attachment');

  await fs.writeFile(legacyAttachmentPath, 'legacy-bytes');

  const firstConnection = initializeDatabase();

  expect(firstConnection.dbPath).toBe(libraryDatabasePath);
  await expect(fs.readFile(libraryAttachmentPath, 'utf8')).resolves.toBe('legacy-bytes');
  await expect(fs.readFile(legacyAttachmentPath, 'utf8')).resolves.toBe('legacy-bytes');
  expect(firstConnection.sqlite.prepare('SELECT COUNT(*) FROM attachments').pluck().get()).toBe(1);
  expect(resolveDatabasePath()).toBe(libraryDatabasePath);
  expect(resolveMigrationStatusFileForTest()).toContain(path.join(mockedAppDataDir, 'config'));

  closeDatabaseConnection();

  const secondConnection = initializeDatabase();

  expect(secondConnection.dbPath).toBe(libraryDatabasePath);
  expect(resolveDatabasePath()).toBe(libraryDatabasePath);
  expect(secondConnection.sqlite.prepare('SELECT title FROM nodes WHERE id = ?').pluck().get('legacy-node')).toBe('Legacy Node');
  await expect(fs.readFile(legacyDatabasePath, 'utf8')).resolves.toBeTruthy();
});

it('falls back to legacy AppData data when attachment migration fails and retries cleanly later', async () => {
  createLegacyDatabase();
  const legacyAttachmentPath = path.join(mockedAppDataDir, 'legacy-attachment');
  const libraryDatabasePath = path.join(mockedDocumentsDir, 'Foliole', 'Data', 'foliole.db');
  const libraryAttachmentPath = path.join(mockedDocumentsDir, 'Foliole', 'Assets', 'legacy-attachment');

  await fs.writeFile(legacyAttachmentPath, 'legacy-bytes');
  const originalCopyFileSync = nodeFs.copyFileSync.bind(nodeFs);
  const copyFileSync = vi.spyOn(nodeFs, 'copyFileSync');
  copyFileSync.mockImplementation((sourcePath, destinationPath, mode) => {
    if (String(sourcePath) === legacyAttachmentPath) {
      throw new Error('forced attachment copy failure');
    }
    return originalCopyFileSync(sourcePath, destinationPath, mode);
  });

  const fallbackConnection = initializeDatabase();

  expect(fallbackConnection.dbPath).toBe(path.join(mockedAppDataDir, 'foliole.db'));
  await expect(fs.access(libraryDatabasePath)).rejects.toThrow();
  await expect(fs.access(libraryAttachmentPath)).rejects.toThrow();

  closeDatabaseConnection();
  copyFileSync.mockRestore();

  const retriedConnection = initializeDatabase();

  expect(retriedConnection.dbPath).toBe(libraryDatabasePath);
  await expect(fs.readFile(libraryAttachmentPath, 'utf8')).resolves.toBe('legacy-bytes');
});
