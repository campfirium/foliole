// @vitest-environment node

import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY } from '../../lib/core/database/fullTextSearchIndexStrategy.js';

let mockedAppDataDir = '/tmp/foliole-external-search-sidecar';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, resolveDatabasePath } from './connection.js';
import {
  refreshExternalSearchIndexes,
  searchExternalDocuments
} from './externalSearchCache.js';
import { closeExternalSearchCacheDatabase } from './externalSearchCacheDatabase.js';
import { saveExternalSearchFolders } from './externalSearchFolders.js';
import { initializeDatabase } from './migrate.js';
import { saveJsonSetting } from './settingsStore.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-external-sidecar-'));
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

function readExternalSearchFtsSql() {
  const db = openSidecarDb();
  try {
    return db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'external_search_fts'")
      .get() as { sql: string } | undefined;
  } finally {
    db.close();
  }
}

function readExternalSearchFtsCount() {
  const db = openSidecarDb();
  try {
    return db.prepare('SELECT COUNT(*) AS count FROM external_search_fts').get() as { count: number };
  } finally {
    db.close();
  }
}

function recreateLegacyTrigramExternalFts() {
  const db = openSidecarDb();
  try {
    db.exec('DROP TABLE IF EXISTS external_search_metadata');
    db.exec('DROP TABLE IF EXISTS external_search_fts');
    db.exec(`CREATE VIRTUAL TABLE external_search_fts USING fts5(
      title,
      file_name,
      relative_path,
      content,
      absolute_path UNINDEXED,
      folder_id UNINDEXED,
      folder_path UNINDEXED,
      modified_at UNINDEXED,
      tokenize = 'trigram'
    )`);
  } finally {
    db.close();
  }
}

async function writeTextFile(filePath: string, content: string, modifiedAt: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
  const modifiedDate = new Date(modifiedAt);
  await fs.utimes(filePath, modifiedDate, modifiedDate);
}

it('rebuilds legacy external FTS with the selected tokenizer from mirror rows', async () => {
  const libraryRoot = path.join(tempRoot, 'library-strategy');
  const presentPath = path.join(libraryRoot, 'present.md');
  const missingPath = path.join(libraryRoot, 'missing.md');
  await writeTextFile(presentPath, 'alpha searchable body', '2026-04-21T01:00:00.000Z');
  await writeTextFile(missingPath, 'missing should not search', '2026-04-21T01:01:00.000Z');
  saveExternalSearchFolders([
    {
      attachment_mode: 'document_relative_first_then_fixed_root',
      attachment_root_path: null,
      excluded_dirs: [],
      folder_path: libraryRoot,
      id: 'folder-strategy'
    }
  ]);

  await refreshExternalSearchIndexes();
  await fs.unlink(missingPath);
  await refreshExternalSearchIndexes();
  closeExternalSearchCacheDatabase();
  recreateLegacyTrigramExternalFts();
  await fs.rm(libraryRoot, { recursive: true, force: true });

  saveJsonSetting('app_settings', { [FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]: 'word-based' });
  expect(searchExternalDocuments('alpha').map((item) => item.id)).toContain(presentPath);

  expect(readExternalSearchFtsSql()?.sql).toContain("tokenize = 'unicode61'");
  expect(readExternalSearchFtsCount()).toEqual({ count: 1 });
  expect(searchExternalDocuments('missing')).toHaveLength(0);

  closeExternalSearchCacheDatabase();
  saveJsonSetting('app_settings', { [FULL_TEXT_SEARCH_INDEX_STRATEGY_SETTING_KEY]: 'cjk-trigram' });
  expect(searchExternalDocuments('alpha').map((item) => item.id)).toContain(presentPath);

  expect(readExternalSearchFtsSql()?.sql).toContain("tokenize = 'trigram'");
  expect(readExternalSearchFtsCount()).toEqual({ count: 1 });
});
