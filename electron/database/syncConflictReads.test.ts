// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-conflict-reads-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import type { NativeSyncNodeConflictRecord } from '../../lib/platform/nativeSyncContract.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { loadSyncNodeConflicts } from './syncConflictReads.js';
import { recordSyncNodeConflicts } from './syncConflicts.js';

let tempRoot = '';

function createConflict(objectId: string, versionId: string): NativeSyncNodeConflictRecord {
  return {
    conflict_version_id: versionId,
    content_hash: `hash-${versionId}`,
    host_name: 'phone',
    object_id: objectId,
    parent_version_id: 'desktop#1',
    snapshot: {
      anchor_link: null,
      attachments: [],
      content: `forked-${objectId}`,
      created_at: '2026-04-21T10:00:00.000Z',
      deleted_at: null,
      desired_retention: null,
      hide_title_heading: false,
      id: objectId,
      image_regions: null,
      is_title_manual: true,
      kind: 'item',
      opening_text: null,
      parent_id: null,
      position: null,
      priority: null,
      reveal: null,
      title: objectId,
      updated_at: '2026-04-21T11:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-04-21T11:00:00.000Z'
  };
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-conflict-reads-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  const connection = initializeDatabaseConnection(openDatabaseConnection());
  connection.driver.execute(
    `INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['node-1', null, 'item', 'Node 1', 'local', '2026-04-21T09:00:00.000Z', '2026-04-21T09:00:00.000Z']
  );
  connection.driver.execute(
    `INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['node-2', null, 'item', 'Node 2', 'local', '2026-04-21T09:00:00.000Z', '2026-04-21T09:00:00.000Z']
  );
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('loads sync conflicts and supports object filtering', () => {
  recordSyncNodeConflicts(
    [createConflict('node-1', 'phone#7'), createConflict('node-2', 'phone#8')],
    '2026-04-21T12:00:00.000Z'
  );

  expect(loadSyncNodeConflicts().map((item) => item.conflict_version_id)).toEqual(['phone#7', 'phone#8']);
  expect(loadSyncNodeConflicts(['node-2']).map((item) => item.object_id)).toEqual(['node-2']);
});
