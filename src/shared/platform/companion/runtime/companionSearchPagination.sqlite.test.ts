// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { createCompanionDatabase } from '../../../../../lib/core/database/companionDatabaseMigrationExecutor';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';
import { COMPANION_DATABASE_VERSION } from '../../../../../lib/platform/nativeCompanionContract';
import { createFakeCompanionDatabaseOwner } from '../../companionSyncNodeVersionsTestSupport';

import { searchIosExternalDocuments, searchIosPdfPageText, searchIosTopics } from './iosCompanionActiveDatabaseReads';

const scope = vi.hoisted(() => ({ port: null as DbPort | null }));
vi.mock('./iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({ read: (task: (db: DbPort) => Promise<unknown>) => task(scope.port!) })
}));

const pdfHash = 'a'.repeat(64);

function seedSearchDatabase(db: Database.Database) {
  const insertTopic = db.prepare(`INSERT INTO nodes (id, title, content, updated_at, created_at)
    VALUES (?, ?, ?, ?, ?)`);
  const insertPdfPage = db.prepare('INSERT INTO pdf_page_text (attachment_id, page, text) VALUES (?, ?, ?)');
  const insertDocument = db.prepare(`INSERT INTO external_documents (
    document_id, folder_id, relative_path, file_name, extension, source_size_bytes, source_modified_at,
    source_modified_ms, content_hash, title, content, indexed_at, created_at, updated_at
  ) VALUES (?, 'folder', ?, ?, '.md', 17, ?, 0, ?, ?, 'prefix alpha body', ?, ?, ?)`);
  for (let index = 0; index < 125; index += 1) {
    const id = String(index).padStart(3, '0');
    insertTopic.run(id, `Topic ${id}`, 'prefix alpha body', id, id);
    insertPdfPage.run(pdfHash, index + 1, 'prefix alpha body');
    insertDocument.run(id, `${id}.md`, `${id}.md`, id, id, `External ${id}`, id, id, id);
  }
  const hiddenPdfHash = 'b'.repeat(64);
  insertTopic.run('hidden', 'alpha', 'alpha', '999', '999');
  insertPdfPage.run(hiddenPdfHash, 1, 'prefix alpha body');
  const mountPdf = db.prepare('UPDATE nodes SET resource_references = ? WHERE id = ?');
  mountPdf.run(JSON.stringify([{ role: 'reference', storage_key: `${pdfHash}.pdf`, original_name: 'Search.pdf' }]), '000');
  mountPdf.run(JSON.stringify([{ role: 'reference', storage_key: `${hiddenPdfHash}.pdf`, original_name: 'Hidden.pdf' }]), 'hidden');
  db.exec(`UPDATE nodes SET deleted_at = 'deleted' WHERE id = 'hidden';
    UPDATE external_documents SET is_present = 0 WHERE document_id = '124'`);
}

it('reaches every result beyond 100 through all three production queries, preserving order and filters', async () => {
  const db = new Database(':memory:');
  try {
    await createFakeCompanionDatabaseOwner(db).runWriter(async port => {
      await port.transaction(tx => createCompanionDatabase(tx, COMPANION_DATABASE_VERSION));
      scope.port = port;
    });
    seedSearchDatabase(db);
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
