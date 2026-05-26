// @vitest-environment node

import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-external-search-mirror-availability';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection, resolveDatabasePath } from './connection.js';
import {
  rebuildExternalSearchIndexes,
  refreshExternalSearchIndexes
} from './externalSearchCache.js';
import { closeExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import { saveExternalSearchFolders } from './externalSearchFolders.js';
import { initializeDatabase } from './migrate.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-external-mirror-availability-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeExternalSearchCacheDatabase();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function openSidecarDb() {
  return new BetterSqlite3(path.join(path.dirname(resolveDatabasePath()), 'foliole-external.db'));
}

function readSidecarPresence(absolutePath: string) {
  const db = openSidecarDb();
  try {
    return db
      .prepare('SELECT is_present FROM external_search_documents WHERE absolute_path = ?')
      .get(absolutePath) as { is_present: number } | undefined;
  } finally {
    db.close();
  }
}

function readMainPresence(documentId: string) {
  return openDatabaseConnection().sqlite
    .prepare('SELECT is_present, missing_at FROM external_documents WHERE document_id = ?')
    .get(documentId) as { is_present: number; missing_at: string | null } | undefined;
}

function readFolderStatus(folderId: string) {
  return openDatabaseConnection().sqlite
    .prepare('SELECT status, last_error FROM external_search_folders WHERE id = ?')
    .get(folderId) as { last_error: string | null; status: string } | undefined;
}

async function writeTextFile(filePath: string, content: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

function saveFolder(folderId: string, folderPath: string) {
  saveExternalSearchFolders([
    {
      attachment_mode: 'document_relative_first_then_fixed_root',
      attachment_root_path: null,
      excluded_dirs: [],
      folder_path: folderPath,
      id: folderId
    }
  ]);
}

it('keeps mirrored documents present when a source folder is temporarily unreachable', async () => {
  const libraryRoot = path.join(tempRoot, 'library');
  const documentPath = path.join(libraryRoot, 'alpha.md');
  saveFolder('folder-unreachable', libraryRoot);
  await writeTextFile(documentPath, 'alpha mirror body');

  await refreshExternalSearchIndexes();
  await fs.rm(libraryRoot, { recursive: true, force: true });
  await refreshExternalSearchIndexes();
  await rebuildExternalSearchIndexes();

  expect(readSidecarPresence(documentPath)).toEqual({ is_present: 1 });
  expect(readMainPresence('folder-unreachable:alpha.md')).toEqual({
    is_present: 1,
    missing_at: null
  });
  expect(readFolderStatus('folder-unreachable')).toMatchObject({ status: 'error' });
});

it('marks mirrored documents missing after a successful empty scan', async () => {
  const libraryRoot = path.join(tempRoot, 'library-empty');
  const documentPath = path.join(libraryRoot, 'gone.md');
  saveFolder('folder-empty', libraryRoot);
  await writeTextFile(documentPath, 'gone mirror body');

  await refreshExternalSearchIndexes();
  await fs.rm(documentPath);
  await refreshExternalSearchIndexes();

  expect(readSidecarPresence(documentPath)).toEqual({ is_present: 0 });
  expect(readMainPresence('folder-empty:gone.md')).toEqual({
    is_present: 0,
    missing_at: expect.any(String)
  });
});
