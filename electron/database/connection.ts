import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { resolveAppPaths } from '../ipc/paths.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';

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

export function resolveDatabasePath(appDataDir = resolveAppPaths().app_data_dir): string {
  return path.join(appDataDir, FOLIOLE_DB_FILE);
}

export function openDatabaseConnection(): DatabaseConnection {
  if (cachedConnection) {
    return cachedConnection;
  }

  const dbPath = resolveDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

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
