import { existsSync } from 'node:fs';

import Database from 'better-sqlite3';

import { createFakeCapacitorConnection } from '../../companionSyncNodeVersionsTestSupport';

interface Target { database: string; readonly: boolean }
interface NativeConnection { db: Database.Database | null; readonly: boolean }

/**
 * Mirrors the Android native SQLite plugin dictionary: native connections outlive the
 * JavaScript document, while each plugin wrapper only knows its own entries.
 */
export function createAndroidSqlitePluginFake(file: string) {
  const connections = new Map<string, NativeConnection>();
  const abandoned: Database.Database[] = [];
  const key = ({ database, readonly }: Target) => `${readonly ? 'RO' : 'RW'}_${database}`;
  const find = (target: Target) => {
    const connection = connections.get(key(target));
    if (!connection) throw new Error(`No available connection for database ${target.database}`);
    return connection;
  };
  const opened = (target: Target) => {
    const { db } = find(target);
    if (!db) throw new Error(`database ${target.database} not opened`);
    return createFakeCapacitorConnection(db);
  };
  const plugin = {
    async isDatabase() { return { result: existsSync(file) }; },
    async createConnection(target: Target) {
      if (connections.has(key(target))) throw new Error(`Connection ${target.database} already exists`);
      connections.set(key(target), { db: null, readonly: target.readonly });
    },
    async closeConnection(target: Target) {
      const db = find(target).db;
      // SQLCipher keeps a session's acquired connection until its transaction ends,
      // even after SQLiteDatabase.close() removes it from the plugin dictionary.
      // https://github.com/sqlcipher/sqlcipher-android/blob/v4.17.0/sqlcipher/src/main/java/net/zetetic/database/sqlcipher/SQLiteDatabase.java#L320-L329
      if (db?.inTransaction) abandoned.push(db);
      else db?.close();
      connections.delete(key(target));
    },
    async open(target: Target) {
      const connection = find(target);
      connection.db ??= new Database(file, { readonly: target.readonly });
    },
    async isDBOpen(target: Target) { return { result: Boolean(find(target).db) }; },
    async isTransactionActive(target: Target) { return { result: Boolean(find(target).db?.inTransaction) }; },
    async getUrl(target: Target) { find(target); return { url: `file://${file}` }; },
    async query(options: Target & { statement: string; values: unknown[] }) {
      return opened(options).query(options.statement, options.values.map(fromAndroidValue));
    },
    async run(options: Target & { statement: string; values: unknown[] }) {
      return opened(options).run(options.statement, options.values.map(fromAndroidValue));
    },
    async beginTransaction(target: Target) { find(target).db!.exec('BEGIN EXCLUSIVE'); return {}; },
    async commitTransaction(target: Target) { await opened(target).commitTransaction(); return {}; },
    async rollbackTransaction(target: Target) { await opened(target).rollbackTransaction(); return {}; }
  };
  return {
    nativeConnections: () => [...connections.keys()].sort(),
    plugin,
    close() {
      for (const connection of connections.values()) connection.db?.close();
      for (const db of abandoned) db.close();
    }
  };
}

function fromAndroidValue(value: unknown) {
  if (value && typeof value === 'object' && (value as { type?: string }).type === 'Buffer') {
    return Uint8Array.from((value as { data: number[] }).data);
  }
  return value;
}
