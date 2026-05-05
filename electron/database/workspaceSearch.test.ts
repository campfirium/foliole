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

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
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
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO nodes (id, title, content, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(input.id, input.title, input.content, '2026-03-01T00:00:00.000Z', input.updatedAt, input.deletedAt ?? null);
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
    kind: 'node',
    pdfMatch: null,
    updatedAt: '2026-03-03T00:00:00.000Z'
  });
  expect(results[1]).toMatchObject({
    id: 'node-content',
    title: 'Weekly Log',
    kind: 'node',
    pdfMatch: null,
    updatedAt: '2026-03-02T00:00:00.000Z'
  });
  expect(results[1]?.excerpt).toContain('Atlas launch checklist');
  expect(results[1]?.excerpt).not.toContain('Should stay hidden from search results.');
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

  const results = searchWorkspace('Atlas');

  expect(results[0]).toMatchObject({
    id: 'node-pdf',
    kind: 'pdf',
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
