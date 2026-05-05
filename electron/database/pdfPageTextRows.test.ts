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

function listPdfPageTextChanges() {
  return openDatabaseConnection().sqlite
    .prepare(
      `SELECT object_id, change_type, payload_json
       FROM sync_change_log
       WHERE object_type = 'pdf_page_text'
       ORDER BY created_at ASC, object_id ASC`
    )
    .all() as Array<{ change_type: string; object_id: string; payload_json: string }>;
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
  expect(listPdfPageTextChanges().map((change) => ({
    changeType: change.change_type,
    objectId: change.object_id,
    payload: JSON.parse(change.payload_json)
  }))).toEqual([
    {
      changeType: 'upsert',
      objectId: 'pdf-1:1',
      payload: { attachment_id: 'pdf-1', page: 1, page_height: 1200, page_width: 800, text: 'Page one' }
    },
    {
      changeType: 'upsert',
      objectId: 'pdf-1:2',
      payload: { attachment_id: 'pdf-1', page: 2, page_height: null, page_width: null, text: 'Page two' }
    }
  ]);
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
  expect(listPdfPageTextChanges().at(-1)).toMatchObject({
    change_type: 'delete',
    object_id: 'pdf-1:2',
    payload_json: JSON.stringify({ attachment_id: 'pdf-1', page: 2 })
  });
});
