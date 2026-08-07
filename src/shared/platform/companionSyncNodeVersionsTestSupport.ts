import Database from 'better-sqlite3';

import { COMPANION_CURRENT_SCHEMA_REPAIRS } from '../../../lib/core/database/companionCurrentSchemaRepairs';
import { COMPANION_SCHEMA_STATEMENTS } from '../../../lib/core/database/companionSchemaStatements';
import type { DbPort } from '../../../lib/core/sync/dbPort';

import { createCapacitorSqliteDbPort } from './capacitorSqliteDbPort';

export function installCompanionNodeSchema(database: Database.Database) {
  database.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  const columnExists = database.prepare('SELECT name FROM pragma_table_info(?) WHERE name = ? LIMIT 1');
  for (const repair of COMPANION_CURRENT_SCHEMA_REPAIRS) {
    if (!columnExists.get(repair.tableName, repair.columnName)) database.exec(repair.statement);
  }
}

export function createFakeCapacitorConnection(database: Database.Database) {
  return {
    beginTransaction: async () => {
      database.exec('BEGIN');
    },
    commitTransaction: async () => {
      database.exec('COMMIT');
    },
    close: async () => undefined,
    execute: async (sql: string) => {
      database.exec(sql);
      const row = database.prepare('SELECT changes() AS count').get() as { count: number };
      return { changes: { changes: row.count } };
    },
    isDBOpen: async () => ({ result: false }),
    open: async () => undefined,
    query: async (sql: string, params: unknown[] = []) => {
      const prepared = prepareStatement(database, sql, params);
      return { values: prepared.statement.all(...prepared.params) };
    },
    rollbackTransaction: async () => {
      database.exec('ROLLBACK');
    },
    run: async (sql: string, params: unknown[] = []) => {
      const prepared = prepareStatement(database, sql, params);
      const info = prepared.statement.run(...prepared.params);
      return { changes: { changes: info.changes, lastId: Number(info.lastInsertRowid) } };
    }
  };
}

export function createFakeCompanionDatabaseOwner(database: Database.Database) {
  const db = createCapacitorSqliteDbPort(createFakeCapacitorConnection(database) as never, 'ios');
  return {
    platform: 'ios' as const,
    read: <T>(task: (port: DbPort) => Promise<T>) => task(db),
    runWriter: <T>(task: (port: DbPort) => Promise<T>) => task(db)
  };
}

function prepareStatement(database: Database.Database, sql: string, params: unknown[]) {
  const expandedParams: unknown[] = [];
  const expandedSql = sql.replace(/\?(\d+)/g, (_placeholder, rawIndex: string) => {
    expandedParams.push(params[Number(rawIndex) - 1]);
    return '?';
  });
  return {
    params: decodeParams(expandedParams.length > 0 ? expandedParams : params),
    statement: database.prepare(expandedSql)
  };
}

function decodeParams(params: unknown[]) {
  return params.map((param) => {
    if (isBufferJson(param)) return Uint8Array.from(param.data);
    return param;
  });
}

function isBufferJson(value: unknown): value is { data: number[]; type: 'Buffer' } {
  return value !== null && typeof value === 'object' && 'type' in value && 'data' in value;
}
