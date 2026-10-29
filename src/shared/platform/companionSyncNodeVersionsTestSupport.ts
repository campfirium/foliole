import path from 'node:path';

import Database from 'better-sqlite3';

import { COMPANION_CURRENT_SCHEMA_REPAIRS } from '../../../lib/core/database/companionCurrentSchemaRepairs';
import { COMPANION_SCHEMA_STATEMENTS } from '../../../lib/core/database/companionSchemaStatements';
import type { DbPort, DbRow } from '../../../lib/core/sync/dbPort';

import type { CapacitorCompanionDatabaseManager } from './companion/runtime/capacitorCompanionDatabaseOwner';

export function installCompanionNodeSchema(database: Database.Database) {
  database.transaction(() => {
    database.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
    const columnExists = database.prepare('SELECT name FROM pragma_table_info(?) WHERE name = ? LIMIT 1');
    for (const repair of COMPANION_CURRENT_SCHEMA_REPAIRS) {
      if (!columnExists.get(repair.tableName, repair.columnName)) database.exec(repair.statement);
    }
  })();
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
    executeSet: async (set: { statement: string; values: unknown[] }[], _transaction?: boolean) => {
      void _transaction;
      let changes = 0;
      let lastId = 0;
      for (const entry of set) for (const values of Array.isArray(entry.values[0]) ? entry.values as unknown[][] : [entry.values]) {
        const prepared = prepareStatement(database, entry.statement, values.map((value) =>
          Array.isArray(value) ? Uint8Array.from(value) : value));
        const info = prepared.statement.run(...prepared.params);
        changes += info.changes;
        lastId = Number(info.lastInsertRowid);
      }
      return { changes: { changes, lastId } };
    },
    isDBOpen: async () => ({ result: false }),
    open: async () => undefined,
    query: async (sql: string, params: unknown[] = []) => {
      if (sql === 'BEGIN DEFERRED' || sql === 'ROLLBACK') {
        database.exec(sql);
        return { values: [] };
      }
      const prepared = prepareStatement(database, sql, params);
      return { values: prepared.statement.all(...prepared.params).map((row) =>
        Object.fromEntries(Object.entries(row as DbRow).map(([key, value]) =>
          [key, Buffer.isBuffer(value) ? Array.from(value) : value]))) };
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

export function createFakeCapacitorDatabaseManager(
  writer: Database.Database, existed: boolean, onWriterClose: () => void
): CapacitorCompanionDatabaseManager {
  const connections = new Map<boolean, Database.Database>([[false, writer]]);
  const journals = new Map<string, Database.Database>();
  const adapt = (database: Database.Database) => ({
    ...createFakeCapacitorConnection(database), getUrl: async () => ({ url: writer.name })
  });
  return {
    closeConnection: async (_name: string, readonly: boolean) => {
      if (journals.has(_name)) { journals.get(_name)!.close(); journals.delete(_name); return; }
      connections.get(readonly)?.close();
      connections.delete(readonly);
      if (!readonly) onWriterClose();
    },
    createConnection: async (_name: string, _encrypted: boolean, _mode: string, _version: number, readonly: boolean) => {
      if (_name.startsWith('foliole-read-intents-')) {
        const file = writer.name && writer.name !== ':memory:' ? path.join(path.dirname(writer.name), _name + '.db') : ':memory:';
        const journal = new Database(file);
        journals.set(_name, journal);
        return adapt(journal);
      }
      const database = readonly ? new Database(writer.name, { readonly: true }) : writer;
      connections.set(readonly, database);
      return adapt(database);
    },
    isConnection: async () => ({ result: false }),
    isDatabase: async () => ({ result: existed }),
    retrieveConnection: async () => adapt(writer)
  } as unknown as CapacitorCompanionDatabaseManager;
}

export function createFakeCompanionDatabaseOwner(database: Database.Database) {
  const db = createFakeDbPort(database);
  return {
    platform: 'ios' as const,
    read: <T>(task: (port: DbPort) => Promise<T>) => task(db),
    runWriter: <T>(task: (port: DbPort) => Promise<T>) => task(db)
  };
}

function createFakeDbPort(database: Database.Database): DbPort {
  let transactionDepth = 0;
  const port: DbPort = {
    async query<T extends DbRow>(sql: string, params = []) {
      const prepared = prepareStatement(database, sql, [...params]);
      return prepared.statement.all(...prepared.params) as T[];
    },
    async run(sql: string, params = []) {
      const prepared = prepareStatement(database, sql, [...params]);
      const result = prepared.statement.run(...prepared.params);
      return { changes: result.changes, lastInsertRowId: result.lastInsertRowid };
    },
    async transaction<T>(execute: (transaction: DbPort) => Promise<T>) {
      if (transactionDepth > 0) return execute(port);
      database.exec('BEGIN');
      transactionDepth += 1;
      try {
        const result = await execute(port);
        database.exec('COMMIT');
        return result;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      } finally {
        transactionDepth -= 1;
      }
    }
  };
  return port;
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
    if (param && typeof param === 'object' && !Array.isArray(param)) {
      const entries = Object.entries(param);
      if (entries.every(([key, value], index) => key === String(index) &&
          Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255)) {
        return Uint8Array.from(entries.map(([, value]) => Number(value)));
      }
    }
    return param;
  });
}

function isBufferJson(value: unknown): value is { data: number[]; type: 'Buffer' } {
  return value !== null && typeof value === 'object' && 'type' in value && 'data' in value;
}
