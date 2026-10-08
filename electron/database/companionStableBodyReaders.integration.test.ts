// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { loadCompanionNodeDocument } from '../../lib/core/database/companionNodeDocumentRead.js';
import { COMPANION_SCHEMA_STATEMENTS } from '../../lib/core/database/companionSchemaStatements.js';
import { loadCompanionWorkspaceNodeFromDb } from '../../lib/core/database/companionWorkspaceNodeRead.js';
import { hashTextBody } from '../../lib/core/database/textBodyHash.js';

import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

const databases: Database.Database[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));

async function fixture(body: string, title = 'Title') {
  const sqlite = new Database(':memory:');
  databases.push(sqlite);
  sqlite.exec(COMPANION_SCHEMA_STATEMENTS.join(';\n'));
  const db = createBetterSqliteDbPort(sqlite);
  sqlite.prepare(`INSERT INTO nodes (id, title, content, body_blob_hash, created_at, updated_at)
    VALUES ('node', ?, ?, ?, 'now', 'now')`).run(title, body, hashTextBody(body));
  return { sqlite, db };
}

async function upgrade(value: Awaited<ReturnType<typeof fixture>>) {
  value.sqlite.exec('DROP TABLE content_blob_data');
}

it('keeps SQLite title and body-status semantics for empty, blank, Unicode NUL and long opened articles', async () => {
  for (const body of ['', '   ', '\t', '中😀\0end', '中😀'.repeat(140_000)]) {
    const value = await fixture(body, '   ');
    const original = await loadCompanionNodeDocument(value.db, 'node');
    const originalNode = await loadCompanionWorkspaceNodeFromDb(value.db, 'node');
    await upgrade(value);
    expect(await loadCompanionNodeDocument(value.db, 'node')).toEqual(original);
    expect(await loadCompanionWorkspaceNodeFromDb(value.db, 'node')).toEqual(originalNode);
  }
});

it('preserves exact BOM bytes for single-article and workspace reads', async () => {
  const body = '\ufeff中😀\0end';
  const value = await fixture(body);
  await upgrade(value);
  expect(await loadCompanionNodeDocument(value.db, 'node')).toMatchObject({ content: body });
  expect(await loadCompanionWorkspaceNodeFromDb(value.db, 'node')).toMatchObject({ content: body });
});

it('uses the same selected PDF, trimmed page order and original body status without shared text storage', async () => {
  const value = await fixture('Linked PDF source ready for the reader surface.', '  PDF  ');
  const hash = 'a'.repeat(64);
  value.sqlite.prepare('UPDATE nodes SET resource_references = ?').run(JSON.stringify([
    { storage_key: `${hash}.pdf`, role: 'reference', original_name: 'Source.pdf' }
  ]));
  value.sqlite.prepare('INSERT INTO pdf_page_text (attachment_id, page, text) VALUES (?, ?, ?)')
    .run(hash, 2, ' Second ');
  value.sqlite.prepare('INSERT INTO pdf_page_text (attachment_id, page, text) VALUES (?, ?, ?)')
    .run(hash, 1, ' First ');
  const original = await loadCompanionNodeDocument(value.db, 'node');
  expect(original).toMatchObject({ content: '# PDF\n\nFirst\n\nSecond', content_status: 'ready' });
  await upgrade(value);
  expect(await loadCompanionNodeDocument(value.db, 'node')).toEqual(original);
  value.sqlite.exec('DELETE FROM pdf_page_text');
  expect(await loadCompanionNodeDocument(value.db, 'node'))
    .toMatchObject({ content: 'Linked PDF source ready for the reader surface.' });
});

it('reads the durable current body independently of obsolete shared availability metadata', async () => {
  const value = await fixture('Original');
  await upgrade(value);
  expect(await loadCompanionNodeDocument(value.db, 'node')).toMatchObject({ content: 'Original', content_status: 'ready' });
  expect(await loadCompanionWorkspaceNodeFromDb(value.db, 'node')).toMatchObject({ content: 'Original' });
});

it('returns missing nodes as null and preserves the lawful no-body empty folder', async () => {
  const value = await fixture('Original');
  await upgrade(value);
  value.sqlite.prepare(`INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
    VALUES ('folder', 'folder', 'Folder', '', 'now', 'now')`).run();
  expect(await loadCompanionWorkspaceNodeFromDb(value.db, 'folder'))
    .toMatchObject({ id: 'folder', kind: 'folder', content: '' });
  expect(await loadCompanionWorkspaceNodeFromDb(value.db, 'missing')).toBeNull();
  expect(await loadCompanionNodeDocument(value.db, 'missing')).toBeNull();
});
