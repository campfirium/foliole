// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-workspace-search-pdf-boundary-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { syncPdfSearchIndexForNodeIds } from '../../lib/core/database/workspaceSearchIndex.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { searchWorkspace } from './workspaceSearch.js';
import { insertPdfAttachment } from './workspaceSearchTestSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workspace-search-pdf-boundary-'));
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

function seedPdfNode(input: { attachmentId: string; nodeId: string; pages: Array<[number, string]> }) {
  upsertNodeSnapshot({
    anchorLink: null,
    content: '',
    createdAt: '2026-05-26T00:00:00.000Z',
    isTitleManual: true,
    kind: 'topic',
    nodeId: input.nodeId,
    parentNodeId: null,
    position: null,
    reveal: null,
    title: input.nodeId,
    updatedAt: '2026-05-26T00:00:00.000Z'
  });
  insertPdfAttachment({ id: input.attachmentId, originalName: `${input.attachmentId}.pdf`, status: 'ready' });
  const sqlite = openDatabaseConnection().sqlite;
  sqlite.prepare('INSERT INTO node_attachments (node_id, attachment_id, role) VALUES (?, ?, ?)')
    .run(input.nodeId, input.attachmentId, 'reference');
  const insertPage = sqlite.prepare('INSERT INTO pdf_page_text (attachment_id, page, text) VALUES (?, ?, ?)');
  input.pages.forEach(([page, text]) => insertPage.run(input.attachmentId, page, text));
  syncPdfSearchIndexForNodeIds(openDatabaseConnection().driver, [input.nodeId]);
  sqlite.prepare('DELETE FROM search.pdf_search').run();
}

it('falls back to PDF page text for long queries when the PDF FTS index is empty', () => {
  seedPdfNode({
    attachmentId: 'pdf-fallback',
    nodeId: 'node-pdf-fallback',
    pages: [[1, 'The durable atlas phrase lives only in page text.']]
  });

  expect(searchWorkspace('durable atlas phrase')[0]).toMatchObject({
    id: 'node-pdf-fallback',
    kind: 'pdf',
    pdfMatch: expect.objectContaining({ attachmentId: 'pdf-fallback', page: 1 })
  });
});

it('keeps cross-page PDF search backed by page text when the PDF FTS index is empty', () => {
  seedPdfNode({
    attachmentId: 'pdf-cross-page',
    nodeId: 'node-pdf-cross-page',
    pages: [[1, 'alpha bri'], [2, 'dge omega']]
  });

  expect(searchWorkspace('bridge')[0]).toMatchObject({
    id: 'node-pdf-cross-page',
    kind: 'pdf',
    pdfMatch: expect.objectContaining({ attachmentId: 'pdf-cross-page', page: 1 })
  });
});
