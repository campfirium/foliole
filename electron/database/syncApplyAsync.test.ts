// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-apply-async-tests';

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
    device_id: 'phone',
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

function createModifiedRemoteNodeRecord(): NativeSyncNodeRecord {
  const base = createRemoteNodeRecord();
  return {
    ...base,
    ancestor_version_ids: ['desktop#0', 'phone#1'],
    content_hash: 'hash-2',
    parent_version_id: 'phone#1',
    snapshot: {
      ...base.snapshot,
      content: 'remote body updated',
      position: 1,
      title: 'Remote Node Updated',
      updated_at: '2026-04-21T12:00:00.000Z'
    },
    updated_at: '2026-04-21T12:00:00.000Z',
    version_created_at: '2026-04-21T12:00:00.000Z',
    version_id: 'phone#2'
  };
}

function createRemoteTombstoneRecord(): NativeSyncNodeRecord {
  const base = createModifiedRemoteNodeRecord();
  return {
    ...base,
    ancestor_version_ids: ['desktop#0', 'phone#1', 'phone#2'],
    content_hash: 'hash-delete',
    parent_version_id: 'phone#2',
    snapshot: {
      ...base.snapshot,
      attachments: [],
      content: 'deleted remote body',
      deleted_at: '2026-04-21T13:00:00.000Z',
      title: 'Deleted Remote Node',
      updated_at: '2026-04-21T13:00:00.000Z'
    },
    updated_at: '2026-04-21T13:00:00.000Z',
    version_created_at: '2026-04-21T13:00:00.000Z',
    version_id: 'phone#delete'
  };
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-apply-async-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('applies remote sync nodes through the async desktop DbPort entry', async () => {
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
      `SELECT current_version_id, last_modified_by_device_id, sync_dirty, title, content, body_blob_hash, position
       FROM nodes WHERE id = ?`
    ).get('node-1')
  ).toEqual({
    body_blob_hash: expect.stringMatching(/^[a-f0-9]{64}$/),
    content: 'remote body',
    current_version_id: 'phone#1',
    last_modified_by_device_id: 'phone',
    position: 4,
    sync_dirty: 0,
    title: 'Remote Node'
  });
  expect(
    connection.sqlite.prepare(
      `SELECT current_version_id, content_hash, last_modified_by_device_id, sync_dirty
       FROM sync_object_state WHERE object_type = 'node' AND object_id = ?`
    ).get('node-1')
  ).toEqual({
    content_hash: 'hash-1',
    current_version_id: 'phone#1',
    last_modified_by_device_id: 'phone',
    sync_dirty: 0
  });
});

it('covers create, repeated apply, and modify through the shared desktop DbPort path', async () => {
  const first = createRemoteNodeRecord();

  await expect(applySyncNodesAsync([first])).resolves.toEqual(['node-1']);
  const initialStateSeq = (openDatabaseConnection().sqlite.prepare(
    `SELECT state_seq FROM sync_object_state WHERE object_type = 'node' AND object_id = ?`
  ).get('node-1') as { state_seq: number }).state_seq;
  await expect(applySyncNodesAsync([first])).resolves.toEqual([]);
  expect(openDatabaseConnection().sqlite.prepare(
    `SELECT state_seq FROM sync_object_state WHERE object_type = 'node' AND object_id = ?`
  ).get('node-1')).toEqual({ state_seq: initialStateSeq });
  await expect(applySyncNodesAsync([createModifiedRemoteNodeRecord()])).resolves.toEqual(['node-1']);

  const connection = openDatabaseConnection();
  expect(
    connection.sqlite.prepare(
      `SELECT current_version_id, title, content, position, sync_dirty
       FROM nodes WHERE id = ?`
    ).get('node-1')
  ).toEqual({
    content: 'remote body updated',
    current_version_id: 'phone#2',
    position: 1,
    sync_dirty: 0,
    title: 'Remote Node Updated'
  });
  expect(
    connection.sqlite.prepare('SELECT COUNT(*) AS count FROM node_sync_versions WHERE object_id = ?').get('node-1')
  ).toEqual({ count: 2 });
  expect(
    connection.sqlite.prepare(
      `SELECT current_version_id, content_hash, sync_dirty
       FROM sync_object_state WHERE object_type = 'node' AND object_id = ?`
    ).get('node-1')
  ).toEqual({
    content_hash: 'hash-2',
    current_version_id: 'phone#2',
    sync_dirty: 0
  });
});

it('covers create, modify, delete, and repeated tombstone through the shared desktop DbPort path', async () => {
  const first = createRemoteNodeRecord();
  const modified = createModifiedRemoteNodeRecord();
  const tombstone = createRemoteTombstoneRecord();

  await expect(applySyncNodesAsync([first])).resolves.toEqual(['node-1']);
  await expect(applySyncNodesAsync([modified])).resolves.toEqual(['node-1']);
  await expect(applySyncNodesAsync([tombstone])).resolves.toEqual(['node-1']);
  await expect(applySyncNodesAsync([tombstone])).resolves.toEqual([]);

  const connection = openDatabaseConnection();
  expect(
    connection.sqlite.prepare(
      `SELECT current_version_id, title, content, deleted_at, sync_dirty
       FROM nodes WHERE id = ?`
    ).get('node-1')
  ).toEqual({
    content: 'deleted remote body',
    current_version_id: 'phone#delete',
    deleted_at: '2026-04-21T13:00:00.000Z',
    sync_dirty: 0,
    title: 'Deleted Remote Node'
  });
  expect(
    connection.sqlite.prepare('SELECT COUNT(*) AS count FROM node_sync_versions WHERE object_id = ?').get('node-1')
  ).toEqual({ count: 3 });
});
