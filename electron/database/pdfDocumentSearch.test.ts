// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-pdf-document-search-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { searchCurrentPdfDocument } from './pdfDocumentSearch.js';
import { insertPdfAttachment } from './workspaceSearchTestSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-pdf-document-search-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function seedPdf(status: 'indexing' | 'ready') {
  upsertNodeSnapshot({
    anchorLink: null, content: '', createdAt: '2026-09-22T00:00:00.000Z', isTitleManual: true,
    kind: 'topic', nodeId: 'pdf-topic', parentNodeId: null, position: null, reveal: null,
    title: 'PDF', updatedAt: '2026-09-22T00:00:00.000Z'
  });
  insertPdfAttachment({ id: 'pdf-attachment', originalName: 'sample.pdf', status });
  const sqlite = openDatabaseConnection().sqlite;
  sqlite.prepare('INSERT INTO node_attachments (node_id, attachment_id, role) VALUES (?, ?, ?)')
    .run('pdf-topic', 'pdf-attachment', 'reference');
  sqlite.prepare('INSERT INTO pdf_page_text (attachment_id, page, text) VALUES (?, ?, ?), (?, ?, ?)')
    .run('pdf-attachment', 1, 'alpha bri', 'pdf-attachment', 2, 'dge keyword keyword');
}

it('searches every occurrence and cross-page match only after the durable index is ready', () => {
  seedPdf('ready');
  expect(searchCurrentPdfDocument('pdf-topic', 'keyword')).toMatchObject({
    matches: [
      { matchStart: 4, page: 2 },
      { matchStart: 12, page: 2 }
    ],
    status: 'ready'
  });
  expect(searchCurrentPdfDocument('pdf-topic', 'bridge')).toMatchObject({
    matches: [{ fragments: [{ page: 1 }, { page: 2 }], page: 1 }],
    status: 'ready'
  });
});

it('does not expose partial rows while indexing is incomplete', () => {
  seedPdf('indexing');
  expect(searchCurrentPdfDocument('pdf-topic', 'keyword')).toEqual({ matches: [], status: 'indexing' });
});
