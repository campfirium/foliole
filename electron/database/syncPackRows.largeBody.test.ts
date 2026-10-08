// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import Database from 'better-sqlite3';
import { expect, it } from 'vitest';

import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { loadPackRows } from './syncPackRows.js';

it('selects node metadata and retains the external document owned text', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'foliole-pack-large-body-'));
  const db = new Database(path.join(directory, 'source.db'));
  try {
    initializeDatabaseSchema(db);
    const driver = createBetterSqlite3Driver(db);
    const body = 'z'.repeat(1024 * 1024);
    driver.execute(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
      VALUES ('large', 'topic', 'Large', ?, 'now', 'now')`, [body]);
    driver.execute(`INSERT INTO external_documents
      (document_id, folder_id, relative_path, file_name, extension, source_size_bytes,
       source_modified_at, source_modified_ms, content_hash, title, content, indexed_at,
       created_at, updated_at)
      VALUES ('document', 'folder', 'large.txt', 'large.txt', 'txt', 1,
        'now', 1, 'document-hash', 'Large document', ?, 'now', 'now', 'now')`, [body]);
    driver.execute(`INSERT INTO sync_object_state
      (object_type, object_id, state_seq, content_hash, last_modified_by_host_name, updated_at)
      VALUES ('node', 'large', 1, 'node-hash', 'source', 'now'),
        ('external_document', 'document', 2, 'document-hash', 'source', 'now')`);

    const rows = loadPackRows(0, 2, driver);

    expect(rows.nodes).toMatchObject([{ id: 'large', content: '' }]);
    expect(rows.externalDocuments).toMatchObject([{ document_id: 'document', content: body }]);
    expect(driver.queryOne<{ content: string }>('SELECT content FROM nodes WHERE id = ?', ['large'])?.content)
      .toBe(body);
    expect(driver.queryOne<{ content: string }>(
      'SELECT content FROM external_documents WHERE document_id = ?', ['document'])?.content).toBe(body);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
