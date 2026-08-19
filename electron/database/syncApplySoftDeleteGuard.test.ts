// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-apply-soft-delete-guard-tests';

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
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-apply-soft-delete-guard-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('does not let an old active remote version revive a locally deleted node', async () => {
  insertDeletedLocalNodeVersion();

  await expect(applySyncNodesAsync([createRemoteNodeRecord()])).resolves.toEqual([]);

  const connection = openDatabaseConnection();
  expect(
    connection.sqlite.prepare('SELECT current_version_id, content, deleted_at FROM nodes WHERE id = ?').get('node-1')
  ).toEqual({
    content: 'deleted local body',
    current_version_id: 'desktop#delete',
    deleted_at: '2026-04-21T12:00:00.000Z'
  });
  expect(connection.sqlite.prepare('SELECT COUNT(*) AS count FROM node_sync_conflicts').get()).toEqual({ count: 0 });
});

function insertDeletedLocalNodeVersion() {
  const connection = openDatabaseConnection();
  connection.driver.execute(
    `INSERT INTO nodes (
       id, kind, title, content, current_version_id, last_modified_by_host_name, sync_dirty,
       created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['node-1', 'item', 'Deleted Local Node', 'deleted local body', 'desktop#delete', 'desktop', 0, '2026-04-21T09:00:00.000Z', '2026-04-21T12:00:00.000Z', '2026-04-21T12:00:00.000Z']
  );
  connection.driver.execute(
    `INSERT INTO node_sync_versions (
       version_id, object_id, parent_version_id, host_name, created_at, content_hash, snapshot_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      'desktop#delete',
      'node-1',
      'desktop#0',
      'desktop',
      '2026-04-21T12:00:00.000Z',
      'hash-delete',
      JSON.stringify({ id: 'node-1', deleted_at: '2026-04-21T12:00:00.000Z' })
    ]
  );
}

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
      attachments: [],
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
