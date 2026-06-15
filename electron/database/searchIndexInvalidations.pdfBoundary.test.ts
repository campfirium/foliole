// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-search-index-pdf-boundary-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { processSearchIndexInvalidations } from '../../lib/core/database/searchIndexInvalidations.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { savePdfPageTextRows } from './pdfPageTextRows.js';
import { searchWorkspace } from './workspaceSearch.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-search-index-pdf-boundary-'));
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

function seedPdfReferenceNode() {
  openDatabaseConnection().sqlite.exec(`
    INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at, pdf_index_status)
    VALUES ('pdf-1', 'paper.pdf', 'application/pdf', 1024, '2026-05-16T10:00:00.000Z', 'ready');
    INSERT INTO nodes (
      id, kind, title, is_title_manual, hide_title_heading, content, created_at, updated_at
    ) VALUES (
      'node-pdf', 'topic', 'Paper', 1, 0, '', '2026-05-16T10:00:00.000Z', '2026-05-16T10:00:00.000Z'
    );
    INSERT INTO node_attachments (node_id, attachment_id, role)
    VALUES ('node-pdf', 'pdf-1', 'reference');
  `);
}

it('refreshes PDF FTS rows after PDF page text invalidation is processed', () => {
  seedPdfReferenceNode();
  savePdfPageTextRows(
    'pdf-1',
    [{ page: 1, pageHeight: 1200, pageWidth: 800, text: 'Atlas appears in PDF text.' }],
    '2026-05-16T10:03:00.000Z'
  );

  expect(openDatabaseConnection().sqlite
    .prepare("SELECT COUNT(*) AS count FROM search.pdf_search WHERE attachment_id = 'pdf-1'")
    .get()).toEqual({ count: 0 });
  processSearchIndexInvalidations(openDatabaseConnection().driver);
  expect(openDatabaseConnection().sqlite
    .prepare("SELECT text FROM search.pdf_search WHERE attachment_id = 'pdf-1' AND page = '1'")
    .get()).toEqual({ text: 'Atlas appears in PDF text.' });

  savePdfPageTextRows(
    'pdf-1',
    [{ page: 1, pageHeight: 1200, pageWidth: 800, text: 'Replaced PDF marker.' }],
    '2026-05-16T10:04:00.000Z'
  );
  processSearchIndexInvalidations(openDatabaseConnection().driver);
  expect(searchWorkspace('Replaced')[0]).toMatchObject({
    id: 'node-pdf',
    kind: 'pdf',
    pdfMatch: expect.objectContaining({ attachmentId: 'pdf-1' })
  });
});
