import { existsSync } from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

// Mirrors the Capacitor SQLite plugin dictionary for the companion browser preview:
// one writer and one readonly connection per database name, backed by real files.
interface Target { database: string; readonly?: boolean }
interface StatementOptions extends Target { statement: string; values?: unknown[]; transaction?: boolean }
interface SetOptions extends Target { set: { statement: string; values?: unknown[] }[]; transaction?: boolean }
interface Connection { db: Database.Database | null; file: string; readonly: boolean }

export const COMPANION_PREVIEW_MAIN_DATABASE = 'foliole-companion';

type Methods = Record<string, (options: never) => unknown>;
type Registry = ReturnType<typeof createConnectionRegistry>;

function createConnectionRegistry(mainFile: string) {
  const connections = new Map<string, Connection>();
  const key = ({ database, readonly = false }: Target) => `${readonly ? 'RO' : 'RW'}_${database}`;
  const fileOf = (database: string) => database === COMPANION_PREVIEW_MAIN_DATABASE
    ? mainFile
    : path.join(path.dirname(mainFile), `${database}SQLite.db`);
  const find = (target: Target) => {
    const connection = connections.get(key(target));
    if (!connection) throw new Error(`No available connection for database ${target.database}`);
    return connection;
  };
  const opened = (target: Target) => {
    const { db } = find(target);
    if (!db) throw new Error(`database ${target.database} not opened`);
    return db;
  };
  return { connections, fileOf, find, key, opened };
}

function connectionMethods({ connections, fileOf, find, key, opened }: Registry): Methods {
  return {
    echo: (options: { value?: string }) => ({ value: options.value }),
    checkConnectionsConsistency: () => ({ result: true }),
    isDatabase: ({ database }: Target) => ({ result: existsSync(fileOf(database)) }),
    isDBExists: ({ database }: Target) => ({ result: existsSync(fileOf(database)) }),
    createConnection(target: Target) {
      if (connections.has(key(target))) throw new Error(`Connection ${target.database} already exists`);
      connections.set(key(target), { db: null, file: fileOf(target.database), readonly: Boolean(target.readonly) });
      return {};
    },
    closeConnection(target: Target) {
      find(target).db?.close();
      connections.delete(key(target));
      return {};
    },
    open(target: Target) {
      const connection = find(target);
      connection.db ??= new Database(connection.file, { readonly: connection.readonly });
      return {};
    },
    close(target: Target) {
      const connection = find(target);
      connection.db?.close();
      connection.db = null;
      return {};
    },
    isDBOpen: (target: Target) => ({ result: Boolean(find(target).db) }),
    getUrl: (target: Target) => ({ url: `file://${find(target).file}` }),
    isTransactionActive: (target: Target) => ({ result: opened(target).inTransaction }),
    beginTransaction(target: Target) { opened(target).exec('BEGIN'); return {}; },
    commitTransaction(target: Target) { opened(target).exec('COMMIT'); return {}; },
    rollbackTransaction(target: Target) { opened(target).exec('ROLLBACK'); return {}; }
  };
}

function inTransaction(db: Database.Database, wrap: boolean | undefined, work: () => unknown) {
  if (wrap === false || db.inTransaction) return work();
  return db.transaction(work)();
}

function statementMethods({ opened }: Registry): Methods {
  return {
    query(options: StatementOptions) {
      const db = opened(options);
      if (/^\s*(BEGIN|ROLLBACK|COMMIT)\b/iu.test(options.statement)) {
        db.exec(options.statement);
        return { values: [] };
      }
      const prepared = prepare(db, options.statement, options.values ?? []);
      return { values: prepared.statement.reader ? prepared.statement.all(...prepared.params).map(encodeRow) : runAndEmpty(prepared) };
    },
    run(options: StatementOptions) {
      const db = opened(options);
      return inTransaction(db, options.transaction, () => {
        const prepared = prepare(db, options.statement, options.values ?? []);
        const info = prepared.statement.run(...prepared.params);
        return { changes: { changes: info.changes, lastId: Number(info.lastInsertRowid) } };
      });
    },
    execute(options: StatementOptions) {
      const db = opened(options);
      return inTransaction(db, options.transaction, () => {
        db.exec(options.statement);
        return { changes: { changes: (db.prepare('SELECT changes() AS count').get() as { count: number }).count } };
      });
    },
    executeSet(options: SetOptions) {
      const db = opened(options);
      return inTransaction(db, options.transaction, () => {
        let changes = 0;
        let lastId = 0;
        for (const entry of options.set) for (const values of rowsOf(entry.values)) {
          const prepared = prepare(db, entry.statement, values);
          const info = prepared.statement.run(...prepared.params);
          changes += info.changes;
          lastId = Number(info.lastInsertRowid);
        }
        return { changes: { changes, lastId } };
      });
    }
  };
}

export function createCompanionPreviewSqliteHost(mainFile: string) {
  const registry = createConnectionRegistry(mainFile);
  const methods = { ...connectionMethods(registry), ...statementMethods(registry) };
  return {
    call(method: string, options: unknown) {
      const handler = methods[method];
      if (!handler) throw new Error(`CapacitorSQLite.${method} is not available in the companion preview`);
      return handler(options as never);
    },
    close() {
      for (const connection of registry.connections.values()) connection.db?.close();
      registry.connections.clear();
    }
  };
}

function runAndEmpty(prepared: ReturnType<typeof prepare>) {
  prepared.statement.run(...prepared.params);
  return [];
}

function rowsOf(values: unknown[] | undefined): unknown[][] {
  if (!values || values.length === 0) return [[]];
  return Array.isArray(values[0]) && !isByteArray(values[0]) ? values as unknown[][] : [values];
}

function prepare(db: Database.Database, sql: string, params: unknown[]) {
  const expanded: unknown[] = [];
  const statement = sql.replace(/\?(\d+)/gu, (_placeholder, index: string) => {
    expanded.push(params[Number(index) - 1]);
    return '?';
  });
  return { params: (expanded.length > 0 ? expanded : params).map(decodeValue), statement: db.prepare(statement) };
}

function decodeValue(value: unknown) {
  if (value && typeof value === 'object' && (value as { type?: string }).type === 'Buffer') {
    return Buffer.from((value as { data: number[] }).data);
  }
  if (isByteArray(value)) return Buffer.from(value);
  return value;
}

function encodeRow(row: unknown) {
  return Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([column, value]) =>
    [column, Buffer.isBuffer(value) ? Array.from(value) : value]));
}

function isByteArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0
    && value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255);
}
