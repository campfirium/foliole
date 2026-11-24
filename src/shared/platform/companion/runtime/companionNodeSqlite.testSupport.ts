import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import {
  closeIosCompanionDatabase, getIosCompanionDatabaseOwner, initializeIosCompanionDatabase,
  type IosCompanionDatabaseManager
} from './iosCompanionDatabaseBootstrap';

function parameters(values: unknown[]): SQLInputValue[] {
  return values.map(value => {
    if (value && typeof value === 'object' && 'type' in value && value.type === 'Buffer'
        && 'data' in value && Array.isArray(value.data)) return Uint8Array.from(value.data);
    return value as SQLInputValue;
  });
}

function openConnection(file: string, readOnly: boolean) {
  const db = new DatabaseSync(file, { readOnly, enableForeignKeyConstraints: false });
  const query = (sql: string, values: unknown[] = []) => {
    if (sql === 'BEGIN DEFERRED' || sql === 'ROLLBACK') { db.exec(sql); return []; }
    return db.prepare(sql).all(...parameters(values));
  };
  const run = (sql: string, values: unknown[]) => {
    const result = db.prepare(sql).run(...parameters(values));
    return { changes: { changes: Number(result.changes), lastId: Number(result.lastInsertRowid) } };
  };
  return {
    beginTransaction: async () => { db.exec('BEGIN'); },
    close: async () => { db.close(); },
    commitTransaction: async () => { db.exec('COMMIT'); },
    execute: async (sql: string) => {
      db.exec(sql);
      return { changes: { changes: Number(db.prepare('SELECT changes() AS count').get()!.count) } };
    },
    executeSet: async (statements: { statement: string; values: unknown[] }[]) => {
      for (const { statement, values } of statements) run(statement, values);
      return { changes: { changes: Number(db.prepare('SELECT changes() AS count').get()!.count) } };
    },
    getUrl: async () => ({ url: file }),
    isDBOpen: async () => ({ result: true }),
    open: async () => {},
    query: async (sql: string, values?: unknown[]) => ({ values: query(sql, values) }),
    rollbackTransaction: async () => { db.exec('ROLLBACK'); },
    run: async (sql: string, values: unknown[]) => run(sql, values)
  };
}

/** Run the production database owner over real SQLite without an Electron or device process. */
export function companionNodeSqliteLibrary() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'companion-node-sqlite-'));
  const connections = new Map<string, ReturnType<typeof openConnection>>();
  const key = (name: string, readOnly: boolean) => `${name}:${readOnly}`;
  const file = (name: string) => path.join(root, `${name}.db`);
  const manager = {
    async closeConnection(name: string, readOnly: boolean) {
      await connections.get(key(name, readOnly))?.close();
      connections.delete(key(name, readOnly));
    },
    async createConnection(name: string, _encrypted: boolean, _mode: string, _version: number, readOnly: boolean) {
      const connection = openConnection(file(name), readOnly);
      connections.set(key(name, readOnly), connection);
      return connection;
    },
    isConnection: async (name: string, readOnly: boolean) => ({ result: connections.has(key(name, readOnly)) }),
    isDatabase: async (name: string) => ({ result: existsSync(file(name)) }),
    retrieveConnection: async (name: string, readOnly: boolean) => connections.get(key(name, readOnly))
  } as unknown as IosCompanionDatabaseManager;
  return {
    async open() {
      await initializeIosCompanionDatabase({
        booted_at: '2026-10-03T00:00:00Z', database_path: null, database_ready: false,
        host_name: 'Companion fixture', runtime_kind: 'android-capacitor'
      }, manager);
      return getIosCompanionDatabaseOwner();
    },
    async dispose() {
      try { await closeIosCompanionDatabase(); }
      finally { rmSync(root, { recursive: true, force: true }); }
    }
  };
}
