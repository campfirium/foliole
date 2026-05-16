// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-workspace-search-query-enhancement-tests';

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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workspace-search-query-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function insertNode(input: { content: string; id: string; title: string; updatedAt: string }) {
  upsertNodeSnapshot({
    nodeId: input.id,
    parentNodeId: null,
    kind: 'topic',
    title: input.title,
    isTitleManual: true,
    content: input.content,
    reveal: null,
    anchorLink: null,
    position: null,
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: input.updatedAt
  });
}

it('keeps punctuation and malformed advanced input on the ordinary workspace search path', () => {
  insertNode({
    id: 'node-question',
    title: 'Question Marker',
    content: 'A title search with question punctuation should still resolve.',
    updatedAt: '2026-05-01T00:00:00.000Z'
  });
  insertNode({
    id: 'node-literal',
    title: 'Literal Marker',
    content: 'Atlas and and Launch appears as ordinary text.',
    updatedAt: '2026-05-02T00:00:00.000Z'
  });

  expect(searchWorkspace('Question?').map((result) => result.id)).toContain('node-question');
  expect(searchWorkspace('Atlas AND AND Launch').map((result) => result.id)).toContain('node-literal');
});

it('finds ordinary multi-word workspace queries when punctuation separates the terms', () => {
  insertNode({
    id: 'node-colon-title',
    title: 'Daily Import',
    content: 'Lists Twitter List: January 17',
    updatedAt: '2026-05-03T00:00:00.000Z'
  });

  const results = searchWorkspace('Lists Twitter List January');

  expect(results.map((result) => result.id)).toContain('node-colon-title');
});

it('supplements node and PDF results with valid uppercase boolean search', () => {
  insertNode({
    id: 'node-advanced',
    title: 'Planning',
    content: 'Atlas roadmap notes mention Launch details later.',
    updatedAt: '2026-05-03T00:00:00.000Z'
  });
  insertNode({
    id: 'node-pdf',
    title: 'PDF Holder',
    content: '',
    updatedAt: '2026-05-04T00:00:00.000Z'
  });
  insertPdfAttachment({ id: 'pdf-advanced', originalName: 'Atlas Launch.pdf', status: 'ready' });
  openDatabaseConnection().sqlite
    .prepare(`INSERT INTO node_attachments (node_id, attachment_id, role) VALUES (?, ?, ?)`)
    .run('node-pdf', 'pdf-advanced', 'reference');
  openDatabaseConnection().sqlite
    .prepare(`INSERT INTO pdf_page_text (attachment_id, page, text) VALUES (?, ?, ?)`)
    .run('pdf-advanced', 1, 'Atlas and Launch appears on one indexed page.');
  syncPdfSearchIndexForNodeIds(openDatabaseConnection().driver, ['node-pdf']);

  const results = searchWorkspace('Atlas AND Launch');

  expect(results.map((result) => result.id)).toContain('node-advanced');
  expect(results.filter((result) => result.kind === 'pdf' && result.id === 'node-pdf')).toHaveLength(1);
});
