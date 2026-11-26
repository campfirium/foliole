// @vitest-environment node
import Database from 'better-sqlite3';
import { expect, it, vi } from 'vitest';

import { COMPANION_PDF_ATTACHMENT_NODE_INDEX_SCHEMA } from '../../../../../lib/core/database/pdfAttachmentNodeIndex';
import type { DbPort } from '../../../../../lib/core/sync/dbPort';

import { loadCompanionSearchSnapshot } from './companionSearchSnapshot';
import { searchIosPdfPageText } from './iosCompanionActiveDatabaseReads';

const scope = vi.hoisted(() => ({ port: null as DbPort | null }));
vi.mock('./iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({
    read: (task: (db: DbPort) => Promise<unknown>) => task(scope.port!),
    readSnapshot: (task: (db: DbPort) => Promise<unknown>) => task(scope.port!)
  })
}));

const hash = (index: number) => index.toString(16).padStart(64, '0');

// Seeds `padding` Topics that each own an unrelated PDF, plus one live and one trashed match.
function seed(padding: number) {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE nodes (id TEXT PRIMARY KEY, parent_id TEXT, title TEXT, opening_text TEXT, content TEXT,
      body_blob_hash TEXT, updated_at TEXT, created_at TEXT, deleted_at TEXT, resource_references TEXT NOT NULL DEFAULT '[]');
    CREATE INDEX idx_nodes_parent_id ON nodes(parent_id);
    CREATE TABLE pdf_page_text (attachment_id TEXT NOT NULL, page INTEGER NOT NULL, text TEXT NOT NULL,
      page_width REAL, page_height REAL, PRIMARY KEY (attachment_id, page));
    CREATE TABLE pdf_index_state (attachment_id TEXT PRIMARY KEY, status TEXT, indexed_at TEXT);
    CREATE TABLE content_blobs (hash TEXT PRIMARY KEY, availability TEXT);
    CREATE TABLE content_blob_data (hash TEXT PRIMARY KEY, data BLOB);
    CREATE TABLE desktop_sources (source_type TEXT, config_ref TEXT, type_settings_json TEXT);
    CREATE TABLE sync_group_devices (device_identity_key TEXT, state TEXT);
    CREATE TABLE external_documents (document_id TEXT PRIMARY KEY, folder_id TEXT, relative_path TEXT,
      file_name TEXT, extension TEXT, title TEXT, opening_text TEXT, reference_kind TEXT, reference_json TEXT,
      content TEXT, body_blob_hash TEXT, updated_at TEXT, is_present INTEGER);
  `);
  db.exec(COMPANION_PDF_ATTACHMENT_NODE_INDEX_SCHEMA.join(';'));
  const node = db.prepare(`INSERT INTO nodes (id, title, content, updated_at, created_at, deleted_at, resource_references)
    VALUES (?, ?, 'body', '1', '1', ?, ?)`);
  const page = db.prepare('INSERT INTO pdf_page_text VALUES (?, ?, ?, NULL, NULL)');
  const mount = (key: string) => JSON.stringify([{ role: 'reference', storage_key: `${key}.pdf`, original_name: 'Doc.pdf' }]);
  node.run('live', 'Live', null, mount(hash(1)));
  page.run(hash(1), 1, 'the quokka page');
  node.run('trashed', 'Trashed', 'now', mount(hash(2)));
  page.run(hash(2), 1, 'another quokka page');
  for (let index = 0; index < padding; index += 1) {
    node.run(`pad-${index}`, `Pad ${index}`, null, mount(hash(1000 + index)));
    page.run(hash(1000 + index), 1, `ordinary page ${index}`);
  }
  // Counts owner mount entries SQLite decodes; the override keeps json_extract semantics for these paths.
  const counter = { decoded: 0 };
  db.function('json_extract', { deterministic: true }, (json: unknown, path: unknown) => {
    counter.decoded += 1;
    const value = (JSON.parse(String(json)) as Record<string, unknown>)[String(path).slice(2)];
    return value === undefined ? null : value as string;
  });
  scope.port = { query: async (sql: string, params: unknown[] = []) => db.prepare(sql).all(...params) } as DbPort;
  return { db, counter };
}

async function measure(padding: number, query: string) {
  const { db, counter } = seed(padding);
  try {
    const pages = (await searchIosPdfPageText(query, 20)).map((row) => row.attachment_id);
    const snapshot = (await loadCompanionSearchSnapshot(query)).pdf.map((row) => row.attachment_id);
    return { pages, snapshot, decoded: counter.decoded };
  } finally {
    scope.port = null;
    db.close();
  }
}

it('keeps PDF search from decoding every owner mount when no page matches', async () => {
  const small = await measure(200, 'zebra');
  const large = await measure(600, 'zebra');
  expect(small).toEqual({ pages: [], snapshot: [], decoded: 0 });
  expect(large).toEqual(small);
});

it('still returns only PDFs that keep a live owning Topic', async () => {
  for (const padding of [0, 200]) {
    const result = await measure(padding, 'QUOKKA');
    expect(result.pages).toEqual([hash(1)]);
    expect(result.snapshot).toEqual([hash(1)]);
    expect(result.decoded).toBe(0);
  }
});
