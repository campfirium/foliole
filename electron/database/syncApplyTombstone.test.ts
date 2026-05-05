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
    device_id: 'desktop',
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
       id, kind, title, content, current_version_id, last_modified_by_device_id, sync_dirty,
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
    connection.sqlite.prepare('SELECT current_version_id, sync_dirty, deleted_at FROM nodes WHERE id = ?').get('node-1')
  ).toEqual({
    current_version_id: 'desktop#delete',
    deleted_at: '2026-04-21T12:00:00.000Z',
    sync_dirty: 0
  });
});
