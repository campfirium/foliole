import path from 'node:path';

import type BetterSqlite3 from 'better-sqlite3';

import type { DbParams, DbPort, DbRow, DbRunResult } from '../../lib/core/sync/dbPort.js';

type SqliteDatabase = BetterSqlite3.Database;

export interface BetterSqliteDbPortOptions {
  name?: string;
}

export function createBetterSqliteDbPort(sqlite: SqliteDatabase, options: BetterSqliteDbPortOptions = {}): DbPort {
  let transactionDepth = 0;
  const port: DbPort & { readonly __dbPortName?: string } = {
    ...(options.name ? { __dbPortName: options.name } : {}),
    async run(sql, params = []) {
      return normalizeRunResult(() => sqlite.prepare(sql).run(...params));
    },
    async query<T extends DbRow = DbRow>(sql: string, params: DbParams = []) {
      return sqlite.prepare(sql).all(...params) as T[];
    },
    async transaction<T>(execute: (tx: DbPort) => Promise<T>) {
      if (transactionDepth > 0) {
        return execute(port);
      }
      sqlite.prepare('BEGIN IMMEDIATE').run();
      transactionDepth += 1;
      try {
        const result = await execute(port);
        sqlite.prepare('COMMIT').run();
        return result;
      } catch (error) {
        sqlite.prepare('ROLLBACK').run();
        throw normalizeSqliteError(error);
      } finally {
        transactionDepth -= 1;
      }
    }
  };
  return port;
}

export function openBetterSqliteDbPort(
  sqliteFactory: (filePath: string) => SqliteDatabase,
  filePath: string,
  options: BetterSqliteDbPortOptions = {}
) {
  const sqlite = sqliteFactory(filePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 100');
  return {
    close() {
      sqlite.close();
    },
    path: path.resolve(filePath),
    port: createBetterSqliteDbPort(sqlite, options)
  };
}

function normalizeRunResult(execute: () => { changes: number; lastInsertRowid: number | bigint }): DbRunResult {
  try {
    const result = execute();
    return {
      changes: result.changes,
      lastInsertRowId: result.lastInsertRowid
    };
  } catch (error) {
    throw normalizeSqliteError(error);
  }
}

function normalizeSqliteError(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error) {
    return error;
  }
  return error;
}
