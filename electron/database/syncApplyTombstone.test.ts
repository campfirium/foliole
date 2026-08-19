// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-apply-tombstone-tests';

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

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { applySyncNodesAsync } from './syncApply.js';

let tempRoot = '';

function tombstoneRecord(): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: ['desktop#2', 'desktop#1'],
    content_hash: 'hash-delete',
    host_name: 'desktop',
    is_tombstone: true,
    object_id: 'node-1',
    object_type: 'node',
    parent_version_id: 'desktop#2',
    snapshot: {
      anchor_link: null,
      attachments: [],
      content: 'deleted remote body',
      created_at: '2026-04-21T10:00:00.000Z',
      deleted_at: '2026-04-21T12:00:00.000Z',
      desired_retention: null,
      hide_title_heading: false,
      id: 'node-1',
      image_regions: null,
      is_title_manual: true,
      kind: 'item',
      opening_text: null,
      parent_id: null,
      position: 4,
      priority: null,
      reveal: null,
      title: 'Deleted Remote Node',
      updated_at: '2026-04-21T12:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-04-21T12:00:00.000Z',
    version_created_at: '2026-04-21T12:00:00.000Z',
    version_id: 'desktop#delete'
  };
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-apply-tombstone-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('applies remote tombstone over a dirty active local node', async () => {
  const connection = openDatabaseConnection();
  connection.driver.execute(
    `INSERT INTO nodes (
       id, kind, title, content, current_version_id, last_modified_by_host_name, sync_dirty,
       created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      'node-1',
      'item',
      'Local Node',
      'local dirty body',
      'desktop#2',
      'phone',
      1,
      '2026-04-21T10:00:00.000Z',
      '2026-04-21T11:00:00.000Z'
    ]
  );

  await expect(applySyncNodesAsync([tombstoneRecord()])).resolves.toEqual(['node-1']);

  expect(
    connection.sqlite.prepare('SELECT id FROM nodes WHERE id = ?').get('node-1')
  ).toBeUndefined();
  expect(
    connection.sqlite.prepare(
      `SELECT node_id, version_id, deleted_at, created_at
       FROM node_sync_tombstones WHERE node_id = ?`
    ).get('node-1')
  ).toEqual({
    created_at: '2026-04-21T12:00:00.000Z',
    deleted_at: '2026-04-21T12:00:00.000Z',
    node_id: 'node-1',
    version_id: 'desktop#delete'
  });
  expect(
    connection.sqlite.prepare(
      `SELECT current_version_id, deleted_at, sync_dirty
       FROM sync_object_state WHERE object_type = 'node' AND object_id = ?`
    ).get('node-1')
  ).toEqual({
    current_version_id: 'desktop#delete',
    deleted_at: '2026-04-21T12:00:00.000Z',
    sync_dirty: 0
  });
});

it('does not let an old active remote version revive a permanent-delete tombstone', async () => {
  const connection = openDatabaseConnection();
  connection.driver.execute(
    `INSERT INTO node_sync_tombstones (
       node_id, version_id, parent_version_id, host_name, content_hash, snapshot_json, deleted_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'node-1',
      'desktop#delete',
      'desktop#2',
      'desktop',
      'hash-delete',
      JSON.stringify({ id: 'node-1', deleted_at: '2026-04-21T12:00:00.000Z' }),
      '2026-04-21T12:00:00.000Z',
      '2026-04-21T12:00:00.000Z'
    ]
  );
  const oldActive = tombstoneRecord();
  oldActive.is_tombstone = false;
  oldActive.snapshot.deleted_at = null;
  oldActive.version_id = 'desktop#old-live';

  await expect(applySyncNodesAsync([oldActive])).resolves.toEqual([]);

  expect(connection.sqlite.prepare('SELECT id FROM nodes WHERE id = ?').get('node-1')).toBeUndefined();
  expect(connection.sqlite.prepare('SELECT COUNT(*) AS count FROM node_sync_conflicts').get()).toEqual({ count: 0 });
  expect(connection.sqlite.prepare('SELECT version_id FROM node_sync_tombstones WHERE node_id = ?').get('node-1'))
    .toEqual({ version_id: 'desktop#delete' });
});
