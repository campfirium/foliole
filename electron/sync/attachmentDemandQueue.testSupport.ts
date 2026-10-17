import Database from 'better-sqlite3';

import { ATTACHMENT_DEMAND_SCHEMA } from '../../lib/core/database/attachmentDemandSchema.js';
import type { RequestSyncDatabaseHost } from '../../lib/core/sync/requestSyncObjectEndpoint.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';

export const imageKey = (value: number) => `${value.toString(16).padStart(64, '0')}.png`;
export const imageBody = (key: string) => `![image](asset://${key})`;
export function demandFixture(filename = ':memory:') {
  const sqlite = new Database(filename);
  sqlite.exec(`CREATE TABLE IF NOT EXISTS nodes (id TEXT PRIMARY KEY, content TEXT, body_blob_hash TEXT,
    resource_references TEXT NOT NULL DEFAULT '[]', deleted_at TEXT, title TEXT);
    CREATE TABLE IF NOT EXISTS framed_sync_resource_availability(hash TEXT PRIMARY KEY, available INTEGER);
    CREATE TABLE IF NOT EXISTS pdf_text_artifact(pdf_hash TEXT, extractor_version INTEGER, storage_key TEXT)`);
  for (const sql of ATTACHMENT_DEMAND_SCHEMA) sqlite.exec(sql);
  const port = createBetterSqliteDbPort(sqlite);
  const host: Pick<RequestSyncDatabaseHost, 'write' | 'readSnapshot'> = {
    readSnapshot: read => port.transaction(read), write: write => write(port)
  };
  const insert = (id: string, content = imageBody(imageKey(1))) => sqlite.prepare(
    'INSERT INTO nodes(id, content) VALUES (?, ?)').run(id, content);
  const pending = () => sqlite.prepare('SELECT storage_key FROM attachment_pending ORDER BY storage_key').pluck().all();
  const queued = () => sqlite.prepare('SELECT article_id FROM attachment_parse_queue ORDER BY article_id').pluck().all();
  return { sqlite, port, host, insert, pending, queued };
}

export function observeDemandQueries(fixture: ReturnType<typeof demandFixture>, observe: (sql: string) => void) {
  const wrap = (db: typeof fixture.port): typeof db => ({ ...db,
    async query(sql, params) { observe(sql); return db.query(sql, params); },
    transaction: execute => db.transaction(tx => execute(wrap(tx)))
  });
  return {
    readSnapshot: <T>(read: (db: typeof fixture.port) => Promise<T>) => fixture.host.readSnapshot(db => read(wrap(db))),
    write: <T>(write: (db: typeof fixture.port) => Promise<T>) => fixture.host.write(db => write(wrap(db)))
  };
}
