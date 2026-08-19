// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-apply-conflict-boundary-tests';

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

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-apply-conflict-boundary-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function insertDirtyLocalNode() {
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (
       id, kind, title, content, current_version_id, last_modified_by_host_name, sync_dirty, created_at, updated_at
     ) VALUES (?, 'item', 'Local Dirty Node', 'local dirty body', ?, 'desktop', 1, ?, ?)`,
    ['node-1', 'desktop#2', '2026-04-21T09:00:00.000Z', '2026-04-21T12:00:00.000Z']
  );
}

function remoteRecord(overrides: Partial<NativeSyncNodeRecord> = {}): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: ['desktop#1'],
    content_hash: 'hash-phone-3',
    host_name: 'phone',
    object_id: 'node-1',
    object_type: 'node',
    parent_version_id: 'desktop#1',
    snapshot: {
      anchor_link: null,
      attachments: [],
      content: 'remote body',
      created_at: '2026-04-21T10:00:00.000Z',
      deleted_at: null,
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
      title: 'Remote Node',
      updated_at: '2026-04-21T13:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-04-21T13:00:00.000Z',
    version_created_at: '2026-04-21T13:00:00.000Z',
    version_id: 'phone#3',
    ...overrides
  };
}

it('preserves dirty local content without creating a duplicate topic before an ancestral tombstone', async () => {
  insertDirtyLocalNode();

  await expect(applySyncNodesAsync([remoteRecord()])).resolves.toEqual([]);

  const connection = openDatabaseConnection();
  expect(connection.sqlite.prepare('SELECT current_version_id, content, sync_dirty, deleted_at FROM nodes WHERE id = ?').get('node-1'))
    .toEqual({
      content: 'local dirty body',
      current_version_id: 'desktop#2',
      deleted_at: null,
      sync_dirty: 1
    });
  expect(connection.sqlite.prepare('SELECT COUNT(*) AS count FROM node_sync_conflicts').get()).toEqual({ count: 0 });
  expect(connection.sqlite.prepare("SELECT COUNT(*) AS count FROM nodes WHERE id LIKE 'conflict-copy-%'").get())
    .toEqual({ count: 0 });

  await expect(applySyncNodesAsync([
    remoteRecord({
      content_hash: 'hash-phone-delete',
      ancestor_version_ids: ['desktop#2', 'desktop#1'],
      parent_version_id: 'desktop#2',
      snapshot: {
        ...remoteRecord().snapshot,
        content: 'remote deleted body',
        deleted_at: '2026-04-21T14:00:00.000Z',
        title: 'Remote Deleted Node',
        updated_at: '2026-04-21T14:00:00.000Z'
      },
      updated_at: '2026-04-21T14:00:00.000Z',
      version_created_at: '2026-04-21T14:00:00.000Z',
      version_id: 'phone#delete'
    })
  ])).resolves.toEqual(['node-1']);

  expect(connection.sqlite.prepare('SELECT current_version_id, content, sync_dirty, deleted_at FROM nodes WHERE id = ?').get('node-1'))
    .toEqual({
      content: 'remote deleted body',
      current_version_id: 'phone#delete',
      deleted_at: '2026-04-21T14:00:00.000Z',
      sync_dirty: 0
    });
});
