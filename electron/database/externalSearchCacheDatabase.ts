import { createRequire } from 'node:module';

import {
  resolveFullTextSearchIndexStrategy,
  type FullTextSearchIndexStrategy
} from '../../lib/core/database/fullTextSearchIndexStrategy.js';
import { assertLibraryHomeMigrationCanOpenDatabase } from '../ipc/libraryPathMigrationRuntime.js';

import { resolveDatabasePath } from './connection.js';
import { resolveExternalSearchDatabasePath } from './databaseFilePaths.js';
import {
  createExternalSearchMetadataTable,
  rebuildExternalSearchSidecar,
  shouldInitializeExternalSearchSidecar
} from './externalSearchSidecar.js';
import { loadJsonSetting } from './settingsStore.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

type SqliteDatabase = import('better-sqlite3').Database;

let cachedCacheDb: SqliteDatabase | null = null;

const APP_SETTINGS_KEY = 'app_settings';

function readExternalSearchIndexStrategy() {
  return resolveFullTextSearchIndexStrategy(
    loadJsonSetting(APP_SETTINGS_KEY) as Record<string, unknown> | null
  ).strategy;
}

export function openExternalSearchCacheDatabase() {
  assertLibraryHomeMigrationCanOpenDatabase(resolveDatabasePath());
  if (cachedCacheDb) {
    ensureExternalSearchCacheStrategy(readExternalSearchIndexStrategy());
    return cachedCacheDb;
  }
  const dbPath = resolveExternalSearchDatabasePath(resolveDatabasePath());
  cachedCacheDb = new BetterSqlite3(dbPath);
  cachedCacheDb.pragma('journal_mode = WAL');
  cachedCacheDb.exec(`CREATE TABLE IF NOT EXISTS external_search_documents (
    absolute_path TEXT PRIMARY KEY,
    folder_id TEXT NOT NULL,
    folder_path TEXT NOT NULL,
    relative_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    extension TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    modified_at TEXT NOT NULL,
    modified_ms INTEGER NOT NULL,
    indexed_at TEXT NOT NULL,
    is_present INTEGER NOT NULL DEFAULT 1,
    last_opened_at TEXT,
    opened_expires_at TEXT,
    missing_at TEXT,
    content TEXT NOT NULL
  )`);
  ensureExternalSearchDocumentColumn('is_present', 'ALTER TABLE external_search_documents ADD COLUMN is_present INTEGER NOT NULL DEFAULT 1');
  ensureExternalSearchDocumentColumn('last_opened_at', 'ALTER TABLE external_search_documents ADD COLUMN last_opened_at TEXT');
  ensureExternalSearchDocumentColumn('opened_expires_at', 'ALTER TABLE external_search_documents ADD COLUMN opened_expires_at TEXT');
  ensureExternalSearchDocumentColumn('missing_at', 'ALTER TABLE external_search_documents ADD COLUMN missing_at TEXT');
  cachedCacheDb.exec(`CREATE INDEX IF NOT EXISTS idx_external_search_documents_folder_id
    ON external_search_documents (folder_id)`);
  createExternalSearchMetadataTable(cachedCacheDb);
  ensureExternalSearchCacheStrategy(readExternalSearchIndexStrategy());
  return cachedCacheDb;
}

function ensureExternalSearchCacheStrategy(strategy: FullTextSearchIndexStrategy) {
  if (!cachedCacheDb) return;
  createExternalSearchMetadataTable(cachedCacheDb);
  if (shouldInitializeExternalSearchSidecar(cachedCacheDb, strategy)) {
    rebuildExternalSearchSidecar(cachedCacheDb, { strategy });
  }
}

export function rebuildExternalSearchCacheStrategy(strategy: FullTextSearchIndexStrategy) {
  return rebuildExternalSearchSidecar(openExternalSearchCacheDatabase(), { strategy });
}

function ensureExternalSearchDocumentColumn(name: string, statement: string) {
  const result = cachedCacheDb
    ?.prepare(`SELECT COUNT(*) AS count FROM pragma_table_info('external_search_documents') WHERE name = ?`)
    .get(name) as { count: number } | undefined;
  if (!result?.count) {
    cachedCacheDb?.exec(statement);
  }
}

export function closeExternalSearchCacheDatabase() {
  if (!cachedCacheDb) {
    return;
  }
  cachedCacheDb.close();
  cachedCacheDb = null;
}
