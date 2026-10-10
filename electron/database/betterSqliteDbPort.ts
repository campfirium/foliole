import path from 'node:path';

import type BetterSqlite3 from 'better-sqlite3';

import type { DbParams, DbPort, DbRow, DbRunResult } from '../../lib/core/sync/dbPort.js';

import { bindFramedSyncPayloadBudget, readFramedSyncPayloadBudget } from './framedSyncPayloadBudgetOwner.js';
import {
  getSqliteConnectionCoordinator,
  SqliteConnectionOwnerError,
  type SqliteConnectionOwner
} from './sqliteConnectionCoordinator.js';

type SqliteDatabase = BetterSqlite3.Database;
const statementCaches = new WeakMap<SqliteDatabase, Map<string, BetterSqlite3.Statement>>();
const MAX_CACHED_STATEMENTS = 128;

function prepareStatement(sqlite: SqliteDatabase, sql: string) {
  let cache = statementCaches.get(sqlite);
  if (!cache) {
    cache = new Map();
    statementCaches.set(sqlite, cache);
  }
  const existing = cache.get(sql);
  if (existing) {
    cache.delete(sql);
    cache.set(sql, existing);
    return existing;
  }
  const statement = sqlite.prepare(sql);
  if (cache.size === MAX_CACHED_STATEMENTS) cache.delete(cache.keys().next().value!);
  cache.set(sql, statement);
  return statement;
}

export interface BetterSqliteDbPortOptions {
  name?: string;
}

export function createBetterSqliteDbPort(sqlite: SqliteDatabase, options: BetterSqliteDbPortOptions = {}): DbPort {
  const coordinator = getSqliteConnectionCoordinator(sqlite);
  const port: DbPort & { readonly __dbPortName?: string } = {
    ...(options.name ? { __dbPortName: options.name } : {}),
    async run(sql, params = []) {
      return coordinator.runExclusive(() => normalizeRunResult(() => prepareStatement(sqlite, sql).run(...params)));
    },
    async query<T extends DbRow = DbRow>(sql: string, params: DbParams = []) {
      return coordinator.runExclusive(() => prepareStatement(sqlite, sql).all(...params) as T[]);
    },
    async transaction<T>(execute: (tx: DbPort) => Promise<T>) {
      return coordinator.runExclusive(async (owner, nested) => (
        runTransaction({ coordinator, execute, nested, owner, port, sqlite })
      ));
    }
  };
  const payloadBudget = readFramedSyncPayloadBudget(sqlite);
  if (payloadBudget) bindFramedSyncPayloadBudget(port, payloadBudget);
  return port;
}

async function runTransaction<T>(input: {
  coordinator: ReturnType<typeof getSqliteConnectionCoordinator>;
  execute: (tx: DbPort) => Promise<T>;
  nested: boolean;
  owner: SqliteConnectionOwner;
  port: DbPort;
  sqlite: SqliteDatabase;
}) {
  if (input.nested && input.sqlite.inTransaction) {
    return runScopedTransaction(input.coordinator, input.owner, input.port, input.execute);
  }
  if (!input.nested && input.sqlite.inTransaction) {
    throw new SqliteConnectionOwnerError('sqlite connection has an uncoordinated active transaction');
  }
  prepareStatement(input.sqlite, 'BEGIN IMMEDIATE').run();
  try {
    const result = await runScopedTransaction(input.coordinator, input.owner, input.port, input.execute);
    prepareStatement(input.sqlite, 'COMMIT').run();
    return result;
  } catch (error) {
    rollbackPreservingOriginalError(input.sqlite, error);
    throw normalizeSqliteError(error);
  }
}

async function runScopedTransaction<T>(
  coordinator: ReturnType<typeof getSqliteConnectionCoordinator>,
  owner: SqliteConnectionOwner,
  port: DbPort,
  execute: (tx: DbPort) => Promise<T>
) {
  let active = true;
  const scopedPort: DbPort = {
    run(sql, params) {
      coordinator.assertScopedOwner(owner, active);
      return port.run(sql, params);
    },
    query(sql, params) {
      coordinator.assertScopedOwner(owner, active);
      return port.query(sql, params);
    },
    transaction(run) {
      coordinator.assertScopedOwner(owner, active);
      return port.transaction(run);
    }
  };
  const payloadBudget = readFramedSyncPayloadBudget(port);
  if (payloadBudget) bindFramedSyncPayloadBudget(scopedPort, payloadBudget);
  try {
    return await execute(scopedPort);
  } finally {
    active = false;
  }
}

function rollbackPreservingOriginalError(sqlite: SqliteDatabase, originalError: unknown) {
  if (!sqlite.inTransaction) return;
  try {
    prepareStatement(sqlite, 'ROLLBACK').run();
  } catch (rollbackError) {
    if (originalError && typeof originalError === 'object') {
      try {
        Object.defineProperty(originalError, 'rollbackError', { configurable: true, value: rollbackError });
      } catch {
        // Keep the original transaction error primary even when it cannot be annotated.
      }
    }
  }
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
