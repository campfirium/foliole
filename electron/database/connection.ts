import { createRequire } from 'node:module';
import path from 'node:path';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { resolveBootstrapLibraryPaths } from '../ipc/libraryPathBootstrap.js';
import { assertLibraryHomeMigrationCanOpenDatabase } from '../ipc/libraryPathMigrationRuntime.js';
import { ensureLibraryPathLayout } from '../ipc/libraryPaths.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { migrateDatabaseFileNames, type DatabaseFileNameMigrationResult } from './databaseFileNameMigration.js';
import { resolveSearchDatabasePath as resolveSearchDatabasePathFromDatabasePath } from './databaseFilePaths.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

export type SqliteDatabase = import('better-sqlite3').Database;

export interface DatabaseConnection {
  driver: DatabaseDriver;
  sqlite: SqliteDatabase;
  dbPath: string;
  searchDbPath: string;
}

interface OpenDatabaseConnectionOptions {
  applyJournalMode?: boolean;
  reportFileNameMigration?: (result: DatabaseFileNameMigrationResult) => void;
}

let cachedConnection: DatabaseConnection | null = null;
const connectionCleanupCallbacks = new Set<() => void>();

export function registerDatabaseConnectionCleanup(callback: () => void) {
  connectionCleanupCallbacks.add(callback);
}

function resolveConfiguredDatabasePath(): string {
  return resolveBootstrapLibraryPaths().database_path;
}

export function resolveDatabasePath(): string {
  return cachedConnection?.dbPath ?? resolveConfiguredDatabasePath();
}

export function resolveSearchDatabasePath(databasePath = resolveDatabasePath()): string {
  return resolveSearchDatabasePathFromDatabasePath(databasePath);
}

function attachSearchDatabase(sqlite: SqliteDatabase, searchDbPath: string) {
  sqlite.prepare('ATTACH DATABASE ? AS search').run(searchDbPath);
}

export function openDatabaseConnection(options: OpenDatabaseConnectionOptions = {}): DatabaseConnection {
  if (cachedConnection) {
    return cachedConnection;
  }
  assertLibraryHomeMigrationCanOpenDatabase();

  const { applyJournalMode = true } = options;
  const libraryPaths = resolveBootstrapLibraryPaths();
  const dbPath = libraryPaths.database_path;
  assertLibraryHomeMigrationCanOpenDatabase(dbPath);
  const searchDbPath = resolveSearchDatabasePath(dbPath);
  ensureLibraryPathLayout(libraryPaths);
  migrateDatabaseFileNames(path.dirname(dbPath)).forEach((result) => {
    options.reportFileNameMigration?.(result);
  });

  const sqlite = new BetterSqlite3(dbPath);
  if (applyJournalMode) {
    sqlite.pragma('journal_mode = WAL');
  }
  sqlite.pragma('foreign_keys = ON');
  attachSearchDatabase(sqlite, searchDbPath);

  cachedConnection = {
    driver: createBetterSqlite3Driver(sqlite),
    sqlite,
    dbPath,
    searchDbPath
  };
  return cachedConnection;
}

export function enableDatabaseWriteAheadLog(connection: DatabaseConnection) {
  connection.sqlite.pragma('journal_mode = WAL');
}

export function closeDatabaseConnection() {
  for (const callback of connectionCleanupCallbacks) {
    callback();
  }
  if (!cachedConnection) {
    return;
  }
  cachedConnection.sqlite.close();
  cachedConnection = null;
}
