// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-node-apply-executor-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { applySyncNodesWithDbPort } from '../../lib/core/sync/syncNodeApplyExecutor.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';
import { createAttachmentRecord } from '../database/attachments.js';
import { createBetterSqliteDbPort } from '../database/betterSqliteDbPort.js';
import { closeDatabaseConnection, openDatabaseConnection } from '../database/connection.js';

let tempRoot = '';

function createRemoteNodeRecord(): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: ['desktop#0'],
    content_hash: 'hash-1',
    host_name: 'phone',
    object_id: 'node-1',
    object_type: 'node',
    parent_version_id: 'desktop#0',
    snapshot: {
      anchor_link: null,
      attachments: [
        { attachment_id: 'att-1', role: 'reference' },
        { attachment_id: 'missing-att', role: 'inline' }
      ],
      content: 'remote body',
      created_at: '2026-04-21T10:00:00.000Z',
      deleted_at: null,
      desired_retention: 0.85,
      hide_title_heading: true,
      id: 'node-1',
      image_regions: null,
      is_title_manual: true,
      kind: 'item',
      opening_text: 'remote opening',
      parent_id: null,
      position: 4,
      priority: 2,
      reveal: 'answer',
      title: 'Remote Node',
      updated_at: '2026-04-21T11:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-04-21T11:00:00.000Z',
    version_created_at: '2026-04-21T11:00:00.000Z',
    version_id: 'phone#1'
  };
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-node-apply-executor-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('applies remote nodes through the shared async DbPort executor', async () => {
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-node-apply-executor-test' });
  createAttachmentRecord({
    id: 'att-1',
    originalName: 'att-1.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 128,
    createdAt: '2026-04-21T09:00:00.000Z'
  });

  await expect(applySyncNodesWithDbPort(port, [createRemoteNodeRecord()])).resolves.toMatchObject({
    appliedIds: ['node-1'],
    blockedIds: [],
    conflictRecords: [],
    skippedConflictCopyIds: []
  });

  expect(
    connection.sqlite.prepare(
      `SELECT current_version_id, last_modified_by_host_name, sync_dirty, title, content, body_blob_hash, position
       FROM nodes WHERE id = ?`
    ).get('node-1')
  ).toEqual({
    body_blob_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    content: 'remote body',
    current_version_id: 'phone#1',
    last_modified_by_host_name: 'phone',
    position: 4,
    sync_dirty: 0,
    title: 'Remote Node'
  });
  expect(
    Buffer.from(
      (connection.sqlite.prepare(
        `SELECT cbd.data
         FROM nodes n
         INNER JOIN content_blob_data cbd ON cbd.hash = n.body_blob_hash
         WHERE n.id = ?`
      ).get('node-1') as { data: Uint8Array }).data
    ).toString('utf8')
  ).toBe('remote body');
  expect(
    connection.sqlite.prepare(
      'SELECT node_id, attachment_id, role FROM node_attachments WHERE node_id = ? ORDER BY attachment_id ASC'
    ).all('node-1')
  ).toEqual([{ attachment_id: 'att-1', node_id: 'node-1', role: 'reference' }]);
  expect(
    connection.sqlite.prepare(
      `SELECT invalidation_type, target_id, status
       FROM search_index_invalidations
       WHERE target_id = ?`
    ).get('node-1')
  ).toEqual({ invalidation_type: 'node_workspace', status: 'pending', target_id: 'node-1' });
});

it('allows host adapters to provide the text body hash implementation', async () => {
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-node-apply-hash-test' });

  await applySyncNodesWithDbPort(port, [createRemoteNodeRecord()], {
    hashTextBody: () => 'f'.repeat(64)
  });

  expect(connection.sqlite.prepare('SELECT body_blob_hash FROM nodes WHERE id = ?').get('node-1')).toEqual({
    body_blob_hash: 'f'.repeat(64)
  });
});

it('updates an existing node through the native-safe fast-forward path', async () => {
  const connection = openDatabaseConnection();
  connection.sqlite.prepare(
    `INSERT INTO nodes (
       id, kind, title, content, current_version_id, last_modified_by_host_name,
       sync_dirty, created_at, updated_at
     ) VALUES (?, 'topic', 'Local Node', 'local body', ?, 'desktop', 0, ?, ?)`
  ).run(
    'node-1',
    'desktop#0',
    '2026-04-21T10:00:00.000Z',
    '2026-04-21T10:00:00.000Z'
  );
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-node-fast-forward-test' });

  await expect(applySyncNodesWithDbPort(port, [createRemoteNodeRecord()])).resolves.toMatchObject({
    appliedIds: ['node-1']
  });

  expect(connection.sqlite.prepare(
    `SELECT current_version_id, last_modified_by_host_name, sync_dirty, title
     FROM nodes WHERE id = ?`
  ).get('node-1')).toEqual({
    current_version_id: 'phone#1',
    last_modified_by_host_name: 'phone',
    sync_dirty: 0,
    title: 'Remote Node'
  });
});

it('applies conflict copies as ordinary sync topics', async () => {
  const connection = openDatabaseConnection();
  const port = createBetterSqliteDbPort(connection.sqlite, { name: 'sync-node-conflict-copy-test' });
  const record = createRemoteNodeRecord();
  record.object_id = 'conflict-copy-shared';
  record.snapshot = { ...record.snapshot, id: record.object_id, title: 'Shared conflict copy' };

  await expect(applySyncNodesWithDbPort(port, [record])).resolves.toMatchObject({
    appliedIds: ['conflict-copy-shared'],
    skippedConflictCopyIds: []
  });
  expect(connection.sqlite.prepare('SELECT title FROM nodes WHERE id = ?').get(record.object_id))
    .toEqual({ title: 'Shared conflict copy' });
});
