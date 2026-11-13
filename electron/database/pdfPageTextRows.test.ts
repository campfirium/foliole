// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { serializeNodeResourceReferences } from '../../lib/core/database/nodeResourceReferences.js';

let mockedAppDataDir = '/tmp/foliole-pdf-page-text-rows-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { savePdfPageTextRows } from './pdfPageTextRows.js';

let tempRoot = '';
const pdfHash = 'a'.repeat(64);

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-pdf-page-text-rows-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await removeTempRoot();
});

async function removeTempRoot() {
  try {
    await fs.rm(tempRoot, { recursive: true, force: true });
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || (error.code !== 'EBUSY' && error.code !== 'EPERM')) {
      throw error;
    }
  }
}

function seedPdfAttachment() {
  seedPdfReferenceNode();
}

function seedPdfReferenceNode() {
  const database = openDatabaseConnection().sqlite;
  database
    .prepare(
      `INSERT INTO nodes (
         id, kind, title, is_title_manual, hide_title_heading, content, created_at, updated_at
       ) VALUES (?, 'topic', ?, 1, 0, ?, ?, ?)`
    )
    .run(
      'node-pdf',
      'Paper',
      '# Paper\n\nLinked PDF source ready for the reader surface.',
      '2026-04-24T00:00:00.000Z',
      '2026-04-24T00:00:00.000Z'
    );
  database
    .prepare('UPDATE nodes SET resource_references = ? WHERE id = ?')
    .run(serializeNodeResourceReferences([
      { storage_key: `${pdfHash}.pdf`, role: 'reference', original_name: 'paper.pdf' }
    ]), 'node-pdf');
}

function listPdfPageTextState() {
  return openDatabaseConnection().sqlite
    .prepare(
      `SELECT object_id, deleted_at, sync_dirty
       FROM sync_object_state
       WHERE object_type = 'pdf_page_text'
       ORDER BY object_id ASC`
    )
    .all() as Array<{ deleted_at: string | null; object_id: string; sync_dirty: number }>;
}

function countPdfPageTextChanges() {
  return openDatabaseConnection().sqlite
    .prepare(
      `SELECT COUNT(*) AS count
       FROM sync_change_log
       WHERE object_type = 'pdf_page_text'`
    )
    .get() as { count: number };
}

function readPdfReferenceNodeBody() {
  const database = openDatabaseConnection().sqlite;
  const row = database
    .prepare(
      `SELECT n.body_blob_hash, n.opening_text, n.sync_dirty, n.content AS body
       FROM nodes n
       WHERE n.id = ?`
    )
    .get('node-pdf') as { body: string; body_blob_hash: string; opening_text: string; sync_dirty: number };
  return row;
}

it('keeps extracted PDF pages local without publishing per-page sync objects', () => {
  seedPdfAttachment();

  savePdfPageTextRows(
    pdfHash,
    [
      { page: 1, pageHeight: 1200, pageWidth: 800, text: 'Page one' },
      { page: 2, pageHeight: null, pageWidth: null, text: 'Page two' }
    ]
  );

  expect(listPdfPageTextState()).toEqual([]);
  expect(countPdfPageTextChanges().count).toBe(0);
});

it('replaces local PDF pages without publishing tombstones', () => {
  seedPdfAttachment();
  savePdfPageTextRows(
    pdfHash,
    [
      { page: 1, pageHeight: 1200, pageWidth: 800, text: 'Page one' },
      { page: 2, pageHeight: 1200, pageWidth: 800, text: 'Page two' }
    ]
  );

  savePdfPageTextRows(
    pdfHash,
    [{ page: 1, pageHeight: 1200, pageWidth: 800, text: 'Page one updated' }]
  );

  expect(listPdfPageTextState()).toEqual([]);
  expect(countPdfPageTextChanges().count).toBe(0);
});

it('keeps a large indexed PDF in one reader without changing its topic body or version', () => {
  seedPdfAttachment();
  const before = readPdfReferenceNodeBody();
  const text = 'Searchable Unicode 文字 '.repeat(50_000);
  expect(Buffer.byteLength(text)).toBeGreaterThan(1_048_576);

  savePdfPageTextRows(pdfHash, [
    { page: 1, pageHeight: 1200, pageWidth: 800, text },
    { page: 2, pageHeight: 1200, pageWidth: 800, text: 'Second extracted page.' }
  ]);

  expect(readPdfReferenceNodeBody()).toEqual(before);
  const { sqlite } = openDatabaseConnection();
  expect(sqlite.prepare('SELECT page, text FROM pdf_page_text WHERE attachment_id = ? ORDER BY page').all(pdfHash))
    .toEqual([{ page: 1, text }, { page: 2, text: 'Second extracted page.' }]);
  expect(sqlite.prepare('SELECT COUNT(*) FROM node_sync_versions WHERE object_id = ?').pluck().get('node-pdf'))
    .toBe(0);
});

it('reindexing preserves the user’s saved PDF topic text', () => {
  seedPdfAttachment();
  const { sqlite } = openDatabaseConnection();
  const content = '# Paper\n\nMy notes. Linked PDF source ready for the reader surface.';
  sqlite.prepare("UPDATE nodes SET content = ? WHERE id = 'node-pdf'").run(content);
  const before = readPdfReferenceNodeBody();

  for (const text of ['First extraction', 'Updated extraction']) {
    savePdfPageTextRows(pdfHash, [{ page: 1, pageHeight: 1200, pageWidth: 800, text }]);
    expect(readPdfReferenceNodeBody()).toEqual(before);
    expect(sqlite.prepare('SELECT text FROM pdf_page_text WHERE attachment_id = ?').pluck().get(pdfHash)).toBe(text);
  }
});
