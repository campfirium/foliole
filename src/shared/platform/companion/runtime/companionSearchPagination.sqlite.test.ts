// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import type { DbPort } from '../../../../../lib/core/sync/dbPort';

import { searchIosExternalDocuments, searchIosPdfPageText, searchIosTopics } from './iosCompanionActiveDatabaseReads';

const scope = vi.hoisted(() => ({ port: null as DbPort | null }));
vi.mock('./iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({ read: (task: (db: DbPort) => Promise<unknown>) => task(scope.port!) })
}));

function seedSearchDatabase(db: Database.Database) {
  db.exec(`
    CREATE TABLE nodes (id TEXT PRIMARY KEY, parent_id TEXT, title TEXT, opening_text TEXT, content TEXT,
      body_blob_hash TEXT, updated_at TEXT, created_at TEXT, deleted_at TEXT);
    CREATE INDEX idx_nodes_parent_id ON nodes(parent_id);
    CREATE TABLE content_blobs (hash TEXT PRIMARY KEY, availability TEXT);
    CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB);
    CREATE TABLE pdf_page_text (attachment_id TEXT, page INTEGER, text TEXT, page_width REAL, page_height REAL);
    CREATE TABLE external_documents (document_id TEXT PRIMARY KEY, folder_id TEXT, relative_path TEXT,
      file_name TEXT, extension TEXT, title TEXT, opening_text TEXT, reference_kind TEXT, reference_json TEXT,
      content TEXT, body_blob_hash TEXT, updated_at TEXT, is_present INTEGER);
  `);
  for (let index = 0; index < 125; index += 1) {
    const id = String(index).padStart(3, '0');
    db.prepare('INSERT INTO nodes VALUES (?,NULL,?,NULL,?,NULL,?,?,NULL)').run(id, `Topic ${id}`, 'prefix alpha body', id, id);
    db.prepare('INSERT INTO pdf_page_text VALUES (?, ?, ?, NULL, NULL)').run('pdf', index + 1, 'prefix alpha body');
    db.prepare('INSERT INTO external_documents VALUES (?,NULL,?,?,NULL,?,NULL,NULL,NULL,?,NULL,?,1)')
      .run(id, `${id}.md`, `${id}.md`, `External ${id}`, 'prefix alpha body', id);
  }
  db.exec("INSERT INTO nodes VALUES ('hidden',NULL,'alpha',NULL,'alpha',NULL,'999','999','deleted')");
  db.exec("UPDATE external_documents SET is_present = 0 WHERE document_id = '124'");
}

it('reaches every result beyond 100 through all three production queries, preserving order and filters', async () => {
  const db = new Database(':memory:');
  try {
    seedSearchDatabase(db);
    scope.port = { query: async (sql: string, params: unknown[] = []) => db.prepare(sql).all(...params) } as DbPort;
    const topics: string[] = [];
    const external: string[] = [];
    const pages: number[] = [];
    for (let offset = 0; offset < 140; offset += 20) {
      const [topicPage, externalPage, pdfPage] = await Promise.all([
        searchIosTopics('alpha', 20, offset), searchIosExternalDocuments('alpha', 20, offset), searchIosPdfPageText('alpha', 20, offset)
      ]);
      topics.push(...topicPage.map((row) => String(row.id)));
      external.push(...externalPage.map((row) => row.document_id));
      pages.push(...pdfPage.map((row) => row.page));
      for (const row of [...topicPage, ...externalPage, ...pdfPage]) expect(row.match_start).toBe(7);
    }
    const ids = Array.from({ length: 125 }, (_, index) => String(124 - index).padStart(3, '0'));
    expect(topics).toEqual(ids);
    expect(external).toEqual(ids.slice(1));
    expect(pages).toEqual(Array.from({ length: 125 }, (_, index) => index + 1));
  } finally {
    scope.port = null;
    db.close();
  }
});
