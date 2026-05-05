// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-workspace-search-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import { syncNodeSearchIndexForNodeIds, syncPdfSearchIndexForNodeIds } from '../../lib/core/database/workspaceSearchIndex.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { restoreNodes, softDeleteNodes, upsertNodeSnapshot } from './nodeMutations.js';
import { searchWorkspace } from './workspaceSearch.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workspace-search-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function insertNode(input: { content: string; deletedAt?: string | null; id: string; title: string; updatedAt: string }) {
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
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: input.updatedAt
  });
  if (input.deletedAt) {
    softDeleteNodes({
      nodeIds: [input.id],
      deletedAt: input.deletedAt
    });
  }
}

function insertPdfAttachment(input: { id: string; originalName: string; status: 'failed' | 'indexing' | 'pending' | 'ready' }) {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at, pdf_index_status)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(input.id, input.originalName, 'application/pdf', 128, '2026-03-01T00:00:00.000Z', input.status);
}

it('searches titles and content from sqlite without needing renderer-side content mirrors', () => {
  insertNode({
    id: 'node-title',
    title: 'Project Atlas',
    content: 'Planning notes stay in sqlite until the node is opened.',
    updatedAt: '2026-03-03T00:00:00.000Z'
  });
  insertNode({
    id: 'node-content',
    title: 'Weekly Log',
    content: 'Atlas launch checklist and follow-up notes.',
    updatedAt: '2026-03-02T00:00:00.000Z'
  });
  insertNode({
    id: 'node-deleted',
    title: 'Atlas Archive',
    content: 'Should stay hidden from search results.',
    deletedAt: '2026-03-04T00:00:00.000Z',
    updatedAt: '2026-03-04T00:00:00.000Z'
  });

  const results = searchWorkspace('Atlas');

  expect(results).toHaveLength(2);
  expect(results[0]).toEqual({
    id: 'node-title',
    title: 'Project Atlas',
    excerpt: 'Planning notes stay in sqlite until the node is opened.',
    externalMatch: null,
    kind: 'node',
    nodeMatch: null,
    pdfMatch: null,
    updatedAt: '2026-03-03T00:00:00.000Z'
  });
  expect(results[1]).toMatchObject({
    externalMatch: null,
    id: 'node-content',
    title: 'Weekly Log',
    kind: 'node',
    nodeMatch: {
      from: 0,
      query: 'atlas',
      to: 5
    },
    pdfMatch: null,
    updatedAt: '2026-03-02T00:00:00.000Z'
  });
  expect(results[1]?.excerpt).toContain('Atlas launch checklist');
  expect(results[1]?.excerpt).not.toContain('Should stay hidden from search results.');
});

it('searches node body blob data before inline content', () => {
  const connection = openDatabaseConnection();
  const bodyBlobHash = upsertTextBodyBlob(connection.driver, 'Bodyblob atlas marker zz', '2026-04-27T00:00:00.000Z');
  connection.driver.execute(
    `INSERT INTO nodes (
       id, parent_id, kind, title, is_title_manual, hide_title_heading,
       content, body_blob_hash, created_at, updated_at
     ) VALUES ('node-blob-search', NULL, 'topic', 'Blob Search', 1, 0, '', ?, ?, ?)`,
    [bodyBlobHash, '2026-04-27T00:00:00.000Z', '2026-04-27T00:00:00.000Z']
  );
  syncNodeSearchIndexForNodeIds(connection.driver, ['node-blob-search']);

  expect(searchWorkspace('atlas')[0]).toMatchObject({
    id: 'node-blob-search',
    kind: 'node',
    nodeMatch: { from: 9, query: 'atlas', to: 14 }
  });
  expect(searchWorkspace('zz')[0]).toMatchObject({
    id: 'node-blob-search',
    kind: 'node'
  });
});

it('includes indexed pdf page hits in workspace search results', () => {
  insertNode({
    id: 'node-pdf',
    title: 'Imported PDF Node',
    content: '',
    updatedAt: '2026-03-05T00:00:00.000Z'
  });
  insertPdfAttachment({ id: 'pdf-attachment-1', originalName: 'Research.pdf', status: 'ready' });
  openDatabaseConnection().sqlite
    .prepare(`INSERT INTO node_attachments (node_id, attachment_id, role) VALUES (?, ?, ?)`)
    .run('node-pdf', 'pdf-attachment-1', 'reference');
  openDatabaseConnection().sqlite
    .prepare(`INSERT INTO pdf_page_text (attachment_id, page, text) VALUES (?, ?, ?)`)
    .run('pdf-attachment-1', 3, 'This page contains Atlas launch details and milestones.');
  syncPdfSearchIndexForNodeIds(openDatabaseConnection().driver, ['node-pdf']);

  const results = searchWorkspace('Atlas');

  expect(results[0]).toMatchObject({
    externalMatch: null,
    id: 'node-pdf',
    kind: 'pdf',
    nodeMatch: null,
    title: 'Research.pdf',
    updatedAt: '2026-03-05T00:00:00.000Z'
  });
  expect(results[0]?.excerpt).toContain('Page 3');
  expect(results[0]?.pdfMatch).toEqual({
    attachmentId: 'pdf-attachment-1',
    matchStart: 19,
    page: 3,
    pageTextLength: 55,
    query: 'atlas'
  });
});

it('does not return page-level pdf results when only the pdf title matches', () => {
  insertNode({
    id: 'node-pdf-title-only',
    title: 'Imported PDF Node',
    content: '',
    updatedAt: '2026-03-05T00:00:00.000Z'
  });
  insertPdfAttachment({ id: 'pdf-attachment-title-only', originalName: 'Atlas Research.pdf', status: 'ready' });
  openDatabaseConnection().sqlite
    .prepare(`INSERT INTO node_attachments (node_id, attachment_id, role) VALUES (?, ?, ?)`)
    .run('node-pdf-title-only', 'pdf-attachment-title-only', 'reference');
  openDatabaseConnection().sqlite
    .prepare(`INSERT INTO pdf_page_text (attachment_id, page, text) VALUES (?, ?, ?)`)
    .run('pdf-attachment-title-only', 3, 'This page contains unrelated content only.');
  syncPdfSearchIndexForNodeIds(openDatabaseConnection().driver, ['node-pdf-title-only']);

  const results = searchWorkspace('Atlas');

  expect(results.some((result) => result.kind === 'pdf' && result.id === 'node-pdf-title-only')).toBe(false);
});

it('includes cross-page pdf hits without changing the per-page storage model', () => {
  insertNode({
    id: 'node-pdf-cross',
    title: 'Imported Cross Page PDF Node',
    content: '',
    updatedAt: '2026-03-06T00:00:00.000Z'
  });
  insertPdfAttachment({ id: 'pdf-attachment-cross', originalName: 'Boundary.pdf', status: 'ready' });
  openDatabaseConnection().sqlite
    .prepare(`INSERT INTO node_attachments (node_id, attachment_id, role) VALUES (?, ?, ?)`)
    .run('node-pdf-cross', 'pdf-attachment-cross', 'reference');
  openDatabaseConnection().sqlite
    .prepare(`INSERT INTO pdf_page_text (attachment_id, page, text) VALUES (?, ?, ?), (?, ?, ?)`)
    .run('pdf-attachment-cross', 3, 'alpha bri', 'pdf-attachment-cross', 4, 'dge omega');
  syncPdfSearchIndexForNodeIds(openDatabaseConnection().driver, ['node-pdf-cross']);

  const results = searchWorkspace('bridge');

  expect(results[0]).toMatchObject({
    externalMatch: null,
    id: 'node-pdf-cross',
    kind: 'pdf',
    nodeMatch: null,
    title: 'Boundary.pdf',
    updatedAt: '2026-03-06T00:00:00.000Z'
  });
  expect(results[0]?.excerpt).toContain('Cross-page match (3-4)');
  expect(results[0]?.pdfMatch).toEqual({
    attachmentId: 'pdf-attachment-cross',
    matchStart: 6,
    page: 3,
    pageTextLength: 9,
    query: 'bridge'
  });
});

it('keeps the search index in sync across node edits and trash changes', () => {
  upsertNodeSnapshot({
    nodeId: 'node-editable',
    parentNodeId: null,
    kind: 'topic',
    title: 'Daily Note',
    isTitleManual: true,
    content: 'Original content only.',
    reveal: null,
    anchorLink: null,
    position: null,
    createdAt: '2026-03-07T00:00:00.000Z',
    updatedAt: '2026-03-07T00:00:00.000Z'
  });

  expect(searchWorkspace('Atlas')).toEqual([]);

  upsertNodeSnapshot({
    nodeId: 'node-editable',
    parentNodeId: null,
    kind: 'topic',
    title: 'Daily Atlas Note',
    isTitleManual: true,
    content: 'Atlas launch checklist and follow-up notes.',
    reveal: null,
    anchorLink: null,
    position: null,
    createdAt: '2026-03-07T00:00:00.000Z',
    updatedAt: '2026-03-08T00:00:00.000Z'
  });

  expect(searchWorkspace('Atlas')).toHaveLength(1);

  softDeleteNodes({
    nodeIds: ['node-editable'],
    deletedAt: '2026-03-09T00:00:00.000Z'
  });
  expect(searchWorkspace('Atlas')).toEqual([]);

  restoreNodes({ nodeIds: ['node-editable'] });
  expect(searchWorkspace('Atlas')).toHaveLength(1);
});

it('keeps 1 to 2 character queries on the fallback path', () => {
  insertNode({
    id: 'node-short',
    title: 'AB',
    content: 'Alpha beta body.',
    updatedAt: '2026-03-10T00:00:00.000Z'
  });

  const results = searchWorkspace('AB');

  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({
    id: 'node-short',
    title: 'AB',
    kind: 'node'
  });
});
