import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';

import { createFakeCapacitorConnection } from '../../companionSyncNodeVersionsTestSupport';

import { closeIosCompanionDatabase, initializeIosCompanionDatabase, type IosCompanionDatabaseManager } from './iosCompanionDatabaseBootstrap';

export async function createSearchLibrary(count = 125, bodySize = 4096) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'search-snapshot-'));
  const file = path.join(root, 'library.db');
  const database = new Database(file);
  const base = createFakeCapacitorConnection(database);
  const connection = { ...base, getUrl: async () => ({ url: file }) };
  const manager = {
    isConnection: async () => ({ result: false }), isDatabase: async () => ({ result: false }),
    createConnection: async () => connection, retrieveConnection: async () => connection,
    closeConnection: async () => database.close()
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
  return { database, connection, base, root, async close() {
    await closeIosCompanionDatabase();
    rmSync(root, { recursive: true, force: true });
  } };
}
