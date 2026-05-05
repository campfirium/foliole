import { createRequire } from 'node:module';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { ensureLibraryPathLayout, loadLibraryPathSettingsSync } from '../ipc/libraryPaths.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { resolveRuntimeDataPaths } from './runtimeDataPaths.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');

export const FOLIOLE_DB_FILE = 'foliole.db';

export type SqliteDatabase = import('better-sqlite3').Database;

export interface DatabaseConnection {
  driver: DatabaseDriver;
  sqlite: SqliteDatabase;
  dbPath: string;
}

let cachedConnection: DatabaseConnection | null = null;

function resolveConfiguredDatabasePath(): string {
  return resolveRuntimeDataPaths().databasePath;
}

export function resolveDatabasePath(): string {
  return cachedConnection?.dbPath ?? resolveConfiguredDatabasePath();
}

export function openDatabaseConnection(): DatabaseConnection {
  if (cachedConnection) {
    return cachedConnection;
  }

  const runtimeDataPaths = resolveRuntimeDataPaths();
  const dbPath = runtimeDataPaths.databasePath;
  ensureLibraryPathLayout(loadLibraryPathSettingsSync());

  const sqlite = new BetterSqlite3(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  cachedConnection = {
    driver: createBetterSqlite3Driver(sqlite),
    sqlite,
    dbPath
  };
  return cachedConnection;
}

export function closeDatabaseConnection() {
  if (!cachedConnection) {
    return;
  }
  cachedConnection.sqlite.close();
  cachedConnection = null;
}
