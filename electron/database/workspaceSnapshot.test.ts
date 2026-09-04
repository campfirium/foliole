// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-workspace-snapshot-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { upsertTextBodyBlob } from '../../lib/core/database/contentBodyBlobs.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { softDeleteNodes, upsertNodeSnapshot } from './nodeMutations.js';
import { loadWorkspaceSnapshot, loadWorkspaceVersionMetadata } from './workspaceSnapshot.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-workspace-snapshot-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function seedNode(nodeId: string, position: number) {
  upsertNodeSnapshot({
    nodeId,
    parentNodeId: null,
    kind: 'topic',
    title: `title:${nodeId}`,
    isTitleManual: true,
    content: `content:${nodeId}`,
    reveal: null,
    anchorLink: null,
    position,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2026-03-06T00:00:00.000Z'
  });
}

it('seeds the initial workspace when sqlite starts empty', () => {
  const snapshot = loadWorkspaceSnapshot({ includeBody: true });

  expect(snapshot).not.toBeNull();
  expect(snapshot?.activeNodeId).toBe('special-inbox');
  expect(snapshot?.nodeOrder).toEqual([
    'special-inbox',
    'special-virtual-root'
  ]);
  expect(snapshot?.nodesById['special-inbox']?.title).toBe('Inbox');
  expect(snapshot?.nodesById['special-virtual-root']?.parentNodeId).toBeNull();
  expect(snapshot?.nodesById['special-virtual-root']?.title).toBe('Virtual');
  expect(snapshot?.nodesById['starter-root-folder']).toBeUndefined();
  expect(snapshot?.nodesById['starter-virtual-example']).toBeUndefined();
  expect(snapshot?.nodesById['starter-welcome']).toBeUndefined();
});

it('loads workspace snapshot from sqlite without localStorage dependency', () => {
  seedNode('node-1', 0);
  seedNode('node-2', 1);
  softDeleteNodes({
    nodeIds: ['node-1'],
    deletedAt: '2026-03-06T00:10:00.000Z'
  });

  const snapshot = loadWorkspaceSnapshot();

  expect(snapshot).not.toBeNull();
  expect(snapshot?.nodeOrder).toEqual([
    'special-inbox',
    'special-virtual-root',
    'node-2'
  ]);
  expect(snapshot?.trashedNodeIds).toEqual(['node-1']);
  expect(snapshot?.trashedNodeDeletedAtById).toEqual({ 'node-1': '2026-03-06T00:10:00.000Z' });
  expect(snapshot?.activeNodeId).toBe('special-inbox');
  expect(snapshot?.nodesById['node-1']?.deletedAt).toBe('2026-03-06T00:10:00.000Z');
  expect(snapshot?.nodesById['node-2']?.content).toBe('');
  expect(snapshot?.untitledSequenceByParent).toEqual({});
});



it('loads full workspace node content from body blob data before inline content', () => {
  const connection = openDatabaseConnection();
  const bodyBlobHash = upsertTextBodyBlob(connection.driver, 'blob body', '2026-04-27T00:00:00.000Z');
  connection.driver.execute(
    `INSERT INTO nodes (
       id, parent_id, kind, title, is_title_manual, hide_title_heading,
       content, body_blob_hash, created_at, updated_at
     ) VALUES ('node-blob', NULL, 'topic', 'Node Blob', 1, 0, '', ?, ?, ?)`,
    [bodyBlobHash, '2026-04-27T00:00:00.000Z', '2026-04-27T00:00:00.000Z']
  );

  expect(loadWorkspaceSnapshot({ includeBody: true })?.nodesById['node-blob']?.content).toBe('blob body');
});

it('loads lightweight workspace snapshots without node content by default', () => {
  seedNode('node-1', 0);

  const snapshot = loadWorkspaceSnapshot();

  expect(snapshot?.nodesById['node-1']?.content).toBe('');
  expect(snapshot?.nodesById['node-1']?.bodyStatus).toBeUndefined();
});

it('includes node attachment references in the workspace snapshot', () => {
  seedNode('node-pdf', 0);
  const database = openDatabaseConnection().sqlite;
  database
    .prepare(`INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run('pdf-attachment-1', 'Paper.pdf', 'application/pdf', 128, '2026-04-27T08:00:00.000Z');
  database
    .prepare(`INSERT INTO node_attachments (node_id, attachment_id, role) VALUES (?, ?, ?)`)
    .run('node-pdf', 'pdf-attachment-1', 'reference');

  const snapshot = loadWorkspaceSnapshot();

  expect(snapshot?.nodesById['node-pdf']?.attachments).toEqual([{
    attachmentId: 'pdf-attachment-1',
    mimeType: 'application/pdf',
    originalName: 'Paper.pdf',
    role: 'reference'
  }]);
});

it('loads lightweight workspace version metadata without building a snapshot', () => {
  seedNode('node-1', 0);
  upsertNodeSnapshot({
    nodeId: 'node-2',
    parentNodeId: null,
    kind: 'topic',
    title: 'title:node-2',
    isTitleManual: true,
    content: 'content:node-2',
    reveal: null,
    anchorLink: null,
    position: 1,
    createdAt: '2026-03-06T00:00:00.000Z',
    updatedAt: '2099-03-07T00:00:00.000Z'
  });

  expect(loadWorkspaceVersionMetadata()).toEqual({
    hasSnapshot: true,
    workspaceVersion: '2099-03-07T00:00:00.000Z'
  });
});

it('loads persisted reading profiles from sqlite snapshot', () => {
  upsertNodeSnapshot({
    nodeId: 'node-reading',
    parentNodeId: null,
    kind: 'topic',
    title: 'Reading node',
    isTitleManual: true,
    content: 'content:reading',
    reveal: null,
    anchorLink: null,
    reading: {
      intervalDurationMs: 0,
      intervalGrowthFactor: 1,
      lastHandledAt: '2026-03-18T00:00:00.000Z',
      nextAt: '2026-03-18T00:00:00.000Z',
      priority: 0,
      readingPosition: 0,
      repetitionCount: 0,
      state: 'dismissed'
    },
    position: 0,
    createdAt: '2026-03-18T00:00:00.000Z',
    updatedAt: '2026-03-18T00:00:00.000Z'
  });

  const snapshot = loadWorkspaceSnapshot();

  expect(snapshot?.nodesById['node-reading']?.reading).toEqual({
    intervalDurationMs: 0,
    intervalGrowthFactor: 1,
    lastHandledAt: '2026-03-18T00:00:00.000Z',
    nextAt: '2026-03-18T00:00:00.000Z',
    priority: 0,
    readingPosition: 0,
    repetitionCount: 0,
    state: 'dismissed'
  });
  expect(snapshot?.untitledSequenceByParent).toEqual({});
});

it('preserves text anchor locators after sqlite reload', () => {
  seedNode('node-parent', 0);
  upsertNodeSnapshot({
    nodeId: 'node-highlight',
    parentNodeId: 'node-parent',
    kind: 'topic',
    title: 'Selected text',
    isTitleManual: true,
    content: 'Alpha',
    reveal: null,
    anchorLink: {
      id: 'anchor-1',
      kind: 'highlight',
      locator: {
        from: 3,
        to: 8,
        originalText: 'Alpha'
      }
    },
    position: 1,
    createdAt: '2026-03-18T00:00:00.000Z',
    updatedAt: '2026-03-18T00:00:00.000Z'
  });

  const snapshot = loadWorkspaceSnapshot();

  expect(snapshot?.nodesById['node-highlight']?.anchorLink).toEqual({
    id: 'anchor-1',
    kind: 'highlight',
    locator: {
      from: 3,
      to: 8,
      originalText: 'Alpha'
    }
  });
  openDatabaseConnection().driver.execute(
    "UPDATE nodes SET anchor_resolution_status = 'unmapped_missing' WHERE id = ?", ['node-highlight']
  );
  expect(loadWorkspaceSnapshot()?.nodesById['node-highlight']?.anchorLink).toBeNull();
});
