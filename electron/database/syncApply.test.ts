// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-apply-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import type { NativeSyncNodeRecord } from '../../lib/platform/nativeSyncContract.js';

import { createAttachmentRecord } from './attachments.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { applySyncNodesAsync } from './syncApply.js';

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

function insertLocalNodeVersion(versionId: string) {
  const connection = openDatabaseConnection();
  connection.driver.execute(
    `INSERT INTO nodes (
       id, kind, title, content, current_version_id, last_modified_by_host_name, sync_dirty, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'node-1',
      'item',
      'Local Node',
      'local body',
      versionId,
      'desktop',
      0,
      '2026-04-21T09:00:00.000Z',
      '2026-04-21T09:30:00.000Z'
    ]
  );
}

function insertDeletedParentWithLiveChildLearning() {
  const connection = openDatabaseConnection();
  connection.driver.execute(
    `INSERT INTO nodes (
       id, kind, title, content, current_version_id, last_modified_by_host_name, sync_dirty,
       created_at, updated_at, deleted_at
     ) VALUES ('deleted-parent', 'folder', 'Deleted Parent', '', 'desktop-parent#delete', 'desktop', 0,
       '2026-04-21T08:00:00.000Z', '2026-04-21T12:00:00.000Z', '2026-04-21T12:00:00.000Z')`
  );
  connection.driver.execute(
    `INSERT INTO nodes (
       id, parent_id, kind, title, content, current_version_id, last_modified_by_host_name, sync_dirty,
       created_at, updated_at
     ) VALUES ('node-1', 'deleted-parent', 'item', 'Hidden Child', '', 'desktop-child#1', 'desktop', 0,
       '2026-04-21T09:00:00.000Z', '2026-04-21T09:30:00.000Z')`
  );
  connection.driver.execute(
    `INSERT INTO node_review (node_id, due, state) VALUES ('node-1', '2026-04-22T00:00:00.000Z', 0)`
  );
  connection.driver.execute(
    `INSERT INTO node_reading (node_id, last_handled_at, next_at, state)
     VALUES ('node-1', '2026-04-21T10:00:00.000Z', '2026-04-22T10:00:00.000Z', 'active')`
  );
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-apply-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('applies remote sync nodes into state, version table, and attachment links', async () => {
  createAttachmentRecord({
    id: 'att-1',
    originalName: 'att-1.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 128,
    createdAt: '2026-04-21T09:00:00.000Z'
  });

  await expect(applySyncNodesAsync([createRemoteNodeRecord()])).resolves.toEqual(['node-1']);

  const connection = openDatabaseConnection();
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
      `SELECT version_id, parent_version_id, host_name, created_at, content_hash, snapshot_json
       FROM node_sync_versions WHERE version_id = ?`
    ).get('phone#1')
  ).toEqual({
    content_hash: 'hash-1',
    created_at: '2026-04-21T11:00:00.000Z',
    host_name: 'phone',
    parent_version_id: 'desktop#0',
    snapshot_json: expect.stringContaining('"title":"Remote Node"'),
    version_id: 'phone#1'
  });
  expect(
    connection.sqlite.prepare(
      'SELECT node_id, attachment_id, role FROM node_attachments WHERE node_id = ? ORDER BY attachment_id ASC'
    ).all('node-1')
  ).toEqual([{ attachment_id: 'att-1', node_id: 'node-1', role: 'reference' }]);
  expect(
    connection.sqlite.prepare('SELECT node_id, position FROM node_order WHERE node_id = ?').get('node-1')
  ).toEqual({ node_id: 'node-1', position: 4 });
});

it('fast-forwards remote node versions when the local version is an ancestor', async () => {
  insertLocalNodeVersion('desktop#1');
  const record = createRemoteNodeRecord();
  record.parent_version_id = 'desktop#1';
  record.ancestor_version_ids = ['desktop#1', 'desktop#0'];

  await expect(applySyncNodesAsync([record])).resolves.toEqual(['node-1']);

  const connection = openDatabaseConnection();
  expect(
    connection.sqlite.prepare('SELECT current_version_id, title, content FROM nodes WHERE id = ?').get('node-1')
  ).toEqual({
    content: 'remote body',
    current_version_id: 'phone#1',
    title: 'Remote Node'
  });
  expect(connection.sqlite.prepare('SELECT conflict_version_id FROM node_sync_conflicts').all()).toEqual([]);
});

it('prunes learning rows when accepted remote nodes remain hidden under deleted parents', async () => {
  insertDeletedParentWithLiveChildLearning();
  const record = createRemoteNodeRecord();
  record.parent_version_id = 'desktop-child#1';
  record.ancestor_version_ids = ['desktop-child#1'];
  record.snapshot.parent_id = 'deleted-parent';

  await expect(applySyncNodesAsync([record])).resolves.toEqual(['node-1']);

  const connection = openDatabaseConnection();
  expect(connection.sqlite.prepare('SELECT node_id FROM node_review WHERE node_id = ?').get('node-1')).toBeUndefined();
  expect(connection.sqlite.prepare('SELECT node_id FROM node_reading WHERE node_id = ?').get('node-1')).toBeUndefined();
});

it('stores divergent remote node versions without reviving the legacy conflict queue', async () => {
  insertLocalNodeVersion('desktop#2');
  const record = createRemoteNodeRecord();
  record.parent_version_id = 'desktop#0';
  record.ancestor_version_ids = ['desktop#0'];

  await expect(applySyncNodesAsync([record])).resolves.toEqual([]);

  const connection = openDatabaseConnection();
  expect(
    connection.sqlite.prepare('SELECT current_version_id, title, content FROM nodes WHERE id = ?').get('node-1')
  ).toEqual({
    content: 'local body',
    current_version_id: 'desktop#2',
    title: 'Local Node'
  });
  expect(connection.sqlite.prepare(
    'SELECT version_id, object_id, parent_version_id, host_name FROM node_sync_versions WHERE version_id = ?'
  ).get('phone#1')).toEqual({
    host_name: 'phone', object_id: 'node-1', parent_version_id: 'desktop#0', version_id: 'phone#1'
  });
  expect(connection.sqlite.prepare('SELECT conflict_version_id FROM node_sync_conflicts').all()).toEqual([]);
});
