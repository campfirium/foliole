// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-apply-already-applied-tests';

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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-apply-already-applied-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('can acknowledge already applied node versions for push cursor delivery', async () => {
  insertLocalNodeVersion('phone#1');

  await expect(applySyncNodesAsync([createRemoteNodeRecord()], { includeAlreadyApplied: true })).resolves.toEqual(['node-1']);
});

it('does not treat same-content restored local versions as already applied without ancestry', async () => {
  insertLocalNodeVersion('desktop#~restore-aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa#1');

  await expect(applySyncNodesAsync([createRemoteNodeRecord()], { includeAlreadyApplied: true })).resolves.toEqual([]);

  expect(
    openDatabaseConnection().driver.queryOne<{ title: string }>('SELECT title FROM nodes WHERE id = ?', ['node-1'])
  ).toEqual({ title: 'Local Node' });
});

function insertLocalNodeVersion(versionId: string) {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO nodes (
       id, kind, title, content, current_version_id, last_modified_by_device_id, sync_dirty, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['node-1', 'item', 'Local Node', 'local body', versionId, 'desktop', 0, '2026-04-21T09:00:00.000Z', '2026-04-21T09:30:00.000Z']
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, current_version_id, content_hash,
       last_modified_by_device_id, updated_at, deleted_at, sync_dirty
     ) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)`,
    ['node', 'node-1', versionId, 'hash-1', 'desktop', '2026-04-21T09:30:00.000Z', null, 0]
  );
}

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
      updated_at: '2026-04-21T11:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-04-21T11:00:00.000Z',
    version_created_at: '2026-04-21T11:00:00.000Z',
    version_id: 'phone#1'
  };
}
