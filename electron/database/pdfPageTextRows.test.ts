// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-pdf-page-text-rows-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function seedPdfAttachment() {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run('pdf-1', 'paper.pdf', 'application/pdf', 1024, '2026-04-24T00:00:00.000Z');
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
    .prepare('INSERT INTO node_attachments (node_id, attachment_id, role) VALUES (?, ?, ?)')
    .run('node-pdf', 'pdf-1', 'reference');
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
      `SELECT n.body_blob_hash, n.opening_text, n.sync_dirty, CAST(cbd.data AS TEXT) AS body_blob_data
       FROM nodes n
       LEFT JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
       WHERE n.id = ?`
    )
    .get('node-pdf') as { body_blob_data: string; body_blob_hash: string; opening_text: string; sync_dirty: number };
  return row;
}

it('writes sync object state for saved PDF page text rows', () => {
  seedPdfAttachment();

  savePdfPageTextRows(
    'pdf-1',
    [
      { page: 1, pageHeight: 1200, pageWidth: 800, text: 'Page one' },
      { page: 2, pageHeight: null, pageWidth: null, text: 'Page two' }
    ],
    '2026-04-24T00:01:00.000Z'
  );

  expect(listPdfPageTextState()).toEqual([
    { object_id: 'pdf-1:1', deleted_at: null, sync_dirty: 1 },
    { object_id: 'pdf-1:2', deleted_at: null, sync_dirty: 1 }
  ]);
  expect(countPdfPageTextChanges().count).toBe(0);
});

it('marks removed PDF pages as deleted sync objects', () => {
  seedPdfAttachment();
  savePdfPageTextRows(
    'pdf-1',
    [
      { page: 1, pageHeight: 1200, pageWidth: 800, text: 'Page one' },
      { page: 2, pageHeight: 1200, pageWidth: 800, text: 'Page two' }
    ],
    '2026-04-24T00:01:00.000Z'
  );

  savePdfPageTextRows(
    'pdf-1',
    [{ page: 1, pageHeight: 1200, pageWidth: 800, text: 'Page one updated' }],
    '2026-04-24T00:02:00.000Z'
  );

  expect(listPdfPageTextState()).toEqual([
    { object_id: 'pdf-1:1', deleted_at: null, sync_dirty: 1 },
    { object_id: 'pdf-1:2', deleted_at: '2026-04-24T00:02:00.000Z', sync_dirty: 1 }
  ]);
  expect(countPdfPageTextChanges().count).toBe(0);
});

it('writes extracted PDF text as the reference node body blob for sync packs', () => {
  seedPdfAttachment();
  seedPdfReferenceNode();

  savePdfPageTextRows(
    'pdf-1',
    [
      { page: 1, pageHeight: 1200, pageWidth: 800, text: 'First extracted page.' },
      { page: 2, pageHeight: 1200, pageWidth: 800, text: 'Second extracted page.' }
    ],
    '2026-04-24T00:03:00.000Z'
  );

  expect(readPdfReferenceNodeBody()).toMatchObject({
    body_blob_data: '# Paper\n\nFirst extracted page.\n\nSecond extracted page.',
    body_blob_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    opening_text: 'First extracted page. Second extracted page.',
    sync_dirty: 1
  });
  expect(openDatabaseConnection().sqlite
    .prepare(`SELECT object_id, object_type FROM sync_object_state WHERE object_type = 'node'`)
    .all()).toEqual([{ object_id: 'node-pdf', object_type: 'node' }]);
});
