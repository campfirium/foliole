import { createRequire } from 'node:module';
import path from 'node:path';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { ensureLibraryPathLayout, loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { migrateDatabaseFileNames, type DatabaseFileNameMigrationResult } from './databaseFileNameMigration.js';
import { resolveSearchDatabasePath as resolveSearchDatabasePathFromDatabasePath } from './databaseFilePaths.js';
import { resolveRuntimeDataPaths } from './runtimeDataPaths.js';

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

function resolveConfiguredDatabasePath(): string {
  return resolveRuntimeDataPaths().databasePath;
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

  const { applyJournalMode = true } = options;
  const runtimeDataPaths = resolveRuntimeDataPaths();
  const dbPath = runtimeDataPaths.databasePath;
  const searchDbPath = resolveSearchDatabasePath(dbPath);
  ensureLibraryPathLayout(loadLibraryPathSettingsSync());
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
  if (!cachedConnection) {
    return;
  }
  cachedConnection.sqlite.close();
  cachedConnection = null;
}
