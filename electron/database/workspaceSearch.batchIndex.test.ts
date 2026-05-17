// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-workspace-search-batch-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';
import {
  syncNodeSearchIndexForNodeIds,
  syncPdfSearchIndexForAttachmentIds,
  syncWorkspaceSearchIndexForNodeIds
} from '../../lib/core/database/workspaceSearchIndex.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { searchWorkspace } from './workspaceSearch.js';
import { insertPdfAttachment } from './workspaceSearchTestSupport.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workspace-search-batch-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function insertNode(input: {
  bodyBlobHash?: string | null;
  content: string;
  deletedAt?: string | null;
  id: string;
  parentId?: string | null;
  title: string;
}) {
  openDatabaseConnection().sqlite
    .prepare(
      `INSERT INTO nodes (
         id, parent_id, kind, title, is_title_manual, hide_title_heading,
         content, body_blob_hash, created_at, updated_at, deleted_at
       ) VALUES (?, ?, 'topic', ?, 1, 0, ?, ?, ?, ?, ?)`
    )
    .run(
      input.id,
      input.parentId ?? null,
      input.title,
      input.content,
      input.bodyBlobHash ?? null,
      '2026-05-16T00:00:00.000Z',
      '2026-05-16T00:00:00.000Z',
      input.deletedAt ?? null
    );
}

function countPathCteExecutions(executeSpy: { mock: { calls: Array<[string, ...unknown[]]> } }) {
  return executeSpy.mock.calls.filter(([sql]) => String(sql).includes('WITH RECURSIVE node_paths')).length;
}

it('indexes high-fanout child nodes with constant path CTE executions', () => {
  const connection = openDatabaseConnection();
  insertNode({ id: 'parent', title: 'Batch Parent', content: '' });
  const childIds = Array.from({ length: 200 }, (_, index) => `child-${index}`);
  childIds.forEach((id, index) => {
    insertNode({
      id,
      parentId: 'parent',
      title: `Child ${index}`,
      content: `batchmarker-${index}`
    });
  });

  const executeSpy = vi.spyOn(connection.driver, 'execute');
  syncWorkspaceSearchIndexForNodeIds(connection.driver, childIds);

  expect(countPathCteExecutions(executeSpy)).toBe(2);
  expect(connection.sqlite.prepare('SELECT COUNT(*) AS count FROM node_search').get()).toEqual({ count: 200 });
});

it('keeps batch node indexing equivalent for blobs, inline fallback, and deleted nodes', () => {
  const connection = openDatabaseConnection();
  const bodyBlobHash = upsertTextBodyBlob(connection.driver, 'blob batch atlas marker', '2026-05-16T00:00:00.000Z');
  insertNode({ id: 'node-blob', title: 'Blob Batch', content: 'inline should not win', bodyBlobHash });
  insertNode({ id: 'node-inline', title: 'Inline Batch', content: 'inline batch atlas marker' });
  insertNode({
    id: 'node-deleted',
    title: 'Deleted Batch',
    content: 'deleted batch atlas marker',
    deletedAt: '2026-05-16T01:00:00.000Z'
  });
  connection.sqlite
    .prepare('INSERT INTO node_search (title, path, content, node_id, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run('Deleted Batch', '', 'stale atlas marker', 'node-deleted', '2026-05-16T00:00:00.000Z');

  syncNodeSearchIndexForNodeIds(connection.driver, ['node-blob', 'node-inline', 'node-deleted']);

  expect(searchWorkspace('atlas').map((result) => result.id)).toEqual(['node-blob', 'node-inline']);
  expect(connection.sqlite.prepare('SELECT COUNT(*) AS count FROM node_search WHERE node_id = ?').get('node-deleted')).toEqual({
    count: 0
  });
});

it('batches attachment-triggered pdf search indexing through one path CTE', () => {
  const connection = openDatabaseConnection();
  const attachmentIds = ['pdf-a', 'pdf-b', 'pdf-c'];
  attachmentIds.forEach((attachmentId, index) => {
    const nodeId = `pdf-node-${index}`;
    insertNode({ id: nodeId, title: `PDF Node ${index}`, content: '' });
    insertPdfAttachment({ id: attachmentId, originalName: `Batch ${index}.pdf`, status: 'ready' });
    connection.sqlite
      .prepare('INSERT INTO node_attachments (node_id, attachment_id, role) VALUES (?, ?, ?)')
      .run(nodeId, attachmentId, 'reference');
    connection.sqlite
      .prepare('INSERT INTO pdf_page_text (attachment_id, page, text) VALUES (?, ?, ?)')
      .run(attachmentId, 1, `attachment batch atlas marker ${index}`);
  });

  const executeSpy = vi.spyOn(connection.driver, 'execute');
  syncPdfSearchIndexForAttachmentIds(connection.driver, attachmentIds);

  expect(countPathCteExecutions(executeSpy)).toBe(1);
  expect(connection.sqlite.prepare('SELECT COUNT(*) AS count FROM pdf_search').get()).toEqual({ count: 3 });
});
