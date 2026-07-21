import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  ASSISTANT_IMAGE_SCHEMA_STATEMENTS,
  ASSISTANT_THREAD_SCHEMA_STATEMENTS
} from '../../lib/core/database/assistantThreadIndexSchemaStatements.js';
import type { DatabaseDriver } from '../../lib/core/database/driver.js';
import { resolveFolioleAideRuntimePaths } from '../assistant/folioleAideRuntime.js';
import { resolveAppPaths } from '../ipc/paths.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { registerDatabaseConnectionCleanup, type SqliteDatabase } from './connection.js';
import { guardBetterSqliteDatabase } from './guardedBetterSqliteDatabase.js';
import { getSqliteConnectionCoordinator } from './sqliteConnectionCoordinator.js';

const require = createRequire(import.meta.url);
const BetterSqlite3 = require('better-sqlite3') as typeof import('better-sqlite3');
const ASSISTANT_HISTORY_SCHEMA_VERSION = 2;

export interface AssistantHistoryConnection {
  dbPath: string;
  driver: DatabaseDriver;
  sqlite: SqliteDatabase;
}

let cachedConnection: AssistantHistoryConnection | null = null;

export function resolveAssistantHistoryDatabasePath() {
  const appDataPath = resolveAppPaths().app_data_dir;
  return resolveFolioleAideRuntimePaths(appDataPath, appDataPath).historyDatabasePath;
}

export function openAssistantHistoryConnection(): AssistantHistoryConnection {
  if (cachedConnection) return cachedConnection;
  const dbPath = resolveAssistantHistoryDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const rawSqlite = new BetterSqlite3(dbPath);
  try {
    rawSqlite.pragma('journal_mode = WAL');
    rawSqlite.pragma('foreign_keys = ON');
    initializeAssistantHistorySchema(rawSqlite);
    const sqlite = guardBetterSqliteDatabase(rawSqlite);
    cachedConnection = { dbPath, driver: createBetterSqlite3Driver(sqlite), sqlite };
    return cachedConnection;
  } catch (error) {
    rawSqlite.close();
    throw error;
  }
}

export function runWithAssistantHistoryConnectionOwner<T>(execute: () => Promise<T> | T) {
  const connection = openAssistantHistoryConnection();
  return getSqliteConnectionCoordinator(connection.sqlite).runExclusive(() => execute());
}

export function closeAssistantHistoryConnection() {
  if (!cachedConnection) return;
  cachedConnection.sqlite.close();
  cachedConnection = null;
}

function initializeAssistantHistorySchema(sqlite: import('better-sqlite3').Database) {
  const version = sqlite.pragma('user_version', { simple: true }) as number;
  if (version === ASSISTANT_HISTORY_SCHEMA_VERSION) return;
  if (version !== 0 && version !== 1) throw new Error(`unsupported_assistant_history_schema_${version}`);
  sqlite.transaction(() => {
    const statements = version === 0
      ? ASSISTANT_THREAD_SCHEMA_STATEMENTS
      : ASSISTANT_IMAGE_SCHEMA_STATEMENTS;
    for (const statement of statements) sqlite.exec(statement);
    sqlite.pragma(`user_version = ${ASSISTANT_HISTORY_SCHEMA_VERSION}`);
  })();
}

registerDatabaseConnectionCleanup(closeAssistantHistoryConnection);
