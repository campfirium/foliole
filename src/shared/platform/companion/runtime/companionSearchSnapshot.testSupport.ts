import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import { createFakeCapacitorConnection, createFakeCapacitorDatabaseManager } from '../../companionSyncNodeVersionsTestSupport';

import { closeIosCompanionDatabase, initializeIosCompanionDatabase, type IosCompanionDatabaseManager } from './iosCompanionDatabaseBootstrap';

export async function createSearchLibrary(count = 125, bodySize = 4096) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'search-snapshot-'));
  const file = path.join(root, 'library.db');
  const database = new Database(file);
  const base = createFakeCapacitorConnection(database);
  const connection = { ...base, getUrl: async () => ({ url: file }) };
  // Snapshot reads open their own readonly connection; closing it must not close the writer.
  // The writer keeps this exact connection object so tests can observe its queries.
  let reader: Database.Database | null = null;
  const journals = new Map<string, Database.Database>();
  const readonlyQueries = {
    query: (sql: string, values?: unknown[]) => {
      if (!reader) throw new Error('Readonly test connection is closed.');
      return createFakeCapacitorConnection(reader).query(sql, values);
    }
  };
  const manager = {
    isConnection: async () => ({ result: false }), isDatabase: async () => ({ result: false }),
    createConnection: async (_name: string, _encrypted: boolean, _mode: string, _version: number, readonly: boolean) => {
      if (_name.startsWith('foliole-read-intents-')) {
        const journal = new Database(path.join(root, _name + '.db'));
        journals.set(_name, journal);
        return createFakeCapacitorConnection(journal);
      }
      if (!readonly) return connection;
      reader = new Database(file, { readonly: true });
      return { ...createFakeCapacitorConnection(reader), query: (sql: string, values?: unknown[]) =>
        readonlyQueries.query(sql, values), getUrl: async () => ({ url: file }) };
    },
    retrieveConnection: async () => connection,
    closeConnection: async (_name: string, readonly: boolean) => {
      if (journals.has(_name)) { journals.get(_name)!.close(); journals.delete(_name); return; }
      if (readonly) { reader?.close(); reader = null; } else database.close();
    }
  } as unknown as IosCompanionDatabaseManager;
  await initializeIosCompanionDatabase({ booted_at: '2026-10-03T00:00:00Z', database_path: null,
    database_ready: false, host_name: 'Search', runtime_kind: 'android-capacitor' }, manager);
  const topic = database.prepare('INSERT INTO nodes (id,title,content,created_at,updated_at) VALUES (?,?,?,?,?)');
  const pdf = database.prepare('INSERT INTO pdf_page_text (attachment_id,page,text) VALUES (?,?,?)');
  const external = database.prepare(`INSERT INTO external_documents
    (document_id,folder_id,relative_path,file_name,extension,source_size_bytes,source_modified_at,
     source_modified_ms,content_hash,title,content,indexed_at,created_at,updated_at)
    VALUES (?,'folder',?,?,'md',0,'now',0,'hash',?,?,'now','now',?)`);
  database.transaction(() => {
    for (let i = 0; i < count; i++) {
      const id = String(i).padStart(6, '0');
      const body = 'prefix alpha ' + 'x'.repeat(bodySize);
      topic.run(id, id, body, id, id);
      pdf.run('pdf', i + 1, body);
      external.run(id, `${id}.md`, `${id}.md`, id, body, id);
    }
  })();
  return { database, connection, readonlyQueries, base, root, async close() {
    await closeIosCompanionDatabase();
    rmSync(root, { recursive: true, force: true });
  } };
}

export async function reopenSearchLibrary(root: string, now: string) {
  await closeIosCompanionDatabase();
  const db = new Database(path.join(root, 'library.db'));
  const connection = { ...createFakeCapacitorConnection(db), getUrl: async () => ({ url: path.join(root, 'library.db') }) };
  const manager = createFakeCapacitorDatabaseManager(db, true, () => {});
  const nativeConnection = connection as unknown as Awaited<ReturnType<typeof manager.createConnection>>;
  const create = manager.createConnection.bind(manager);
  const retrieve = manager.retrieveConnection.bind(manager);
  manager.createConnection = async (...args) => args[0] !== 'foliole-companion' || args[4] ? create(...args) : nativeConnection;
  manager.retrieveConnection = async (...args) => args[0] !== 'foliole-companion' || args[1] ? retrieve(...args) : nativeConnection;
  await initializeIosCompanionDatabase({ booted_at: now, database_path: null, database_ready: false,
    host_name: 'Search', runtime_kind: 'android-capacitor' }, manager);
  return { db, connection };
}
