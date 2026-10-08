// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, expect, it } from 'vitest';

import { hashTextBody, upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { migrateCompanionExternalDocumentBodyOwnership, migrateExternalDocumentBodyOwnership } from '../../lib/core/database/externalDocumentBodyOwnershipMigration.js';
import { initializeDatabaseSchema } from '../../lib/core/database/migrations.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { createBetterSqliteDbPort } from './betterSqliteDbPort.js';

const databases: Database.Database[] = [];
const now = '2026-10-08T00:00:00.000Z';
afterEach(() => databases.splice(0).forEach((database) => database.close()));
function host() {
  const sqlite = new Database(':memory:');
  databases.push(sqlite);
  initializeDatabaseSchema(sqlite);
  const driver = createBetterSqlite3Driver(sqlite);
  function insert(id: string, content: string, body: string) {
    const hash = upsertTextBodyBlob(driver, body, now);
    sqlite.prepare(`INSERT INTO external_documents (document_id, folder_id, relative_path, file_name,
      extension, source_size_bytes, source_modified_at, source_modified_ms, content_hash, title,
      body_blob_hash, content, indexed_at, created_at, updated_at)
      VALUES (?, 'folder', ?, ?, 'md', ?, ?, 1, 'stable-object-identity', 'Title', ?, ?, ?, ?, ?)`)
      .run(id, id, id, Buffer.byteLength(body), now, hash, content, now, now, now);
    return hash;
  }
  return { sqlite, insert, port: createBetterSqliteDbPort(sqlite) };
}
async function migrate(value: ReturnType<typeof host>, adapter: 'desktop' | 'companion') {
  if (adapter === 'desktop') value.sqlite.transaction(() => migrateExternalDocumentBodyOwnership(value.sqlite))();
  else await value.port.transaction(migrateCompanionExternalDocumentBodyOwnership);
}

it.each(['desktop', 'companion'] as const)('converts %s legacy bodies while preserving IDs, metadata and exact UTF-8', async (adapter) => {
  const value = host();
  const bodies = ['', '\ufeff中😀\0tail', '中😀'.repeat(149796) + 'abcd'];
  bodies.forEach((body, index) => value.insert(`doc-${index}`, '', body));
  const before = value.sqlite.prepare('SELECT document_id,content_hash,body_blob_hash,created_at,updated_at FROM external_documents ORDER BY document_id').all();
  await migrate(value, adapter);
  bodies.forEach((body, index) => expect(value.sqlite.prepare('SELECT content = ? AS exact FROM external_documents WHERE document_id = ?')
    .get(body, `doc-${index}`)).toEqual({ exact: 1 }));
  expect(value.sqlite.prepare('SELECT document_id,content_hash,body_blob_hash,created_at,updated_at FROM external_documents ORDER BY document_id').all()).toEqual(before);
  await migrate(value, adapter);
  expect(value.sqlite.prepare('SELECT count(*) FROM external_documents').pluck().get()).toBe(3);
});

it.each(['desktop', 'companion'] as const)('accepts already owned %s text without reading a damaged obsolete cache', async (adapter) => {
  const value = host();
  const body = '\ufeff中😀\0owned';
  const hash = value.insert('document', body, body);
  value.sqlite.prepare("UPDATE content_blob_data SET data = X'FF' WHERE hash = ?").run(hash);
  await migrate(value, adapter);
  expect(value.sqlite.prepare('SELECT content,body_blob_hash FROM external_documents').get()).toEqual({ content: body, body_blob_hash: hashTextBody(body) });
});

it.each(['desktop', 'companion'] as const)('rolls back earlier %s conversions when hash, UTF-8 or inline content contradicts the source', async (adapter) => {
  for (const failure of ['hash', 'utf8', 'inline']) {
    const value = host();
    value.insert('a', '', 'First body');
    const hash = value.insert('z', failure === 'inline' ? 'Contradictory' : '', 'Second body');
    if (failure !== 'inline') value.sqlite.prepare('UPDATE content_blob_data SET data = ? WHERE hash = ?')
      .run(failure === 'hash' ? Buffer.from('Wrong body!') : Buffer.alloc(11, 255), hash);
    await expect(migrate(value, adapter)).rejects.toThrow();
    expect(value.sqlite.prepare("SELECT content FROM external_documents WHERE document_id = 'a'").pluck().get()).toBe('');
    expect(value.sqlite.prepare("SELECT content FROM external_documents WHERE document_id = 'z'").pluck().get())
      .toBe(failure === 'inline' ? 'Contradictory' : '');
  }
});

it.each(['desktop', 'companion'] as const)('rejects an oversized %s source atomically without truncation', async (adapter) => {
  const value = host();
  value.insert('a', '', 'First body');
  const body = 'x'.repeat(1_048_577);
  const hash = value.insert('z', '', body);
  await expect(migrate(value, adapter)).rejects.toThrow();
  expect(value.sqlite.prepare("SELECT content FROM external_documents WHERE document_id = 'a'").pluck().get()).toBe('');
  expect(value.sqlite.prepare('SELECT length(data) AS bytes FROM content_blob_data WHERE hash = ?').get(hash))
    .toEqual({ bytes: 1_048_577 });
});

it.each(['desktop', 'companion'] as const)('updates only the known legacy %s search triggers to read owned text', async (adapter) => {
  const value = host();
  value.insert('document', '', 'Original body');
  const triggers = value.sqlite.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'stored_search_external_documents_%'").all() as { name: string; sql: string }[];
  for (const trigger of triggers) {
    value.sqlite.exec(`DROP TRIGGER ${trigger.name}`);
    value.sqlite.exec(trigger.sql.replace("d.content, 'external'", "COALESCE(CAST(cbd.data AS TEXT), d.content), 'external'")
      .replace('FROM external_documents d', 'FROM external_documents d LEFT JOIN content_blob_data cbd ON cbd.hash = d.body_blob_hash'));
  }
  await migrate(value, adapter);
  value.sqlite.exec("DROP TABLE content_blob_data; UPDATE external_documents SET content = 'New owned body'");
  expect(value.sqlite.prepare("SELECT content FROM stored_source_search WHERE source_key = 'document'").pluck().get()).toBe('New owned body');
});
