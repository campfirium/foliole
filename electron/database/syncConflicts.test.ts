// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-conflicts-tests';

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
import { recordSyncNodeConflicts } from './syncConflicts.js';

let tempRoot = '';

function createConflict(): NativeSyncNodeConflictRecord {
  return {
    conflict_version_id: 'phone#7',
    content_hash: 'hash-conflict',
    device_id: 'phone',
    object_id: 'node-1',
    parent_version_id: 'desktop#3',
    snapshot: {
      anchor_link: null,
      attachments: [],
      content: 'forked body',
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
      position: 1,
      priority: null,
      reveal: null,
      title: 'Forked Node',
      updated_at: '2026-04-21T11:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-04-21T11:00:00.000Z'
  };
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-conflicts-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  const connection = initializeDatabaseConnection(openDatabaseConnection());
  connection.driver.execute(
    `INSERT INTO nodes (id, parent_id, kind, title, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['node-1', null, 'item', 'Node 1', 'local', '2026-04-21T09:00:00.000Z', '2026-04-21T09:00:00.000Z']
  );
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('stores sync node conflicts as durable records', () => {
  expect(recordSyncNodeConflicts([createConflict()], '2026-04-21T12:00:00.000Z')).toEqual(['phone#7']);

  const row = openDatabaseConnection().sqlite.prepare(
    `SELECT conflict_version_id, object_id, parent_version_id, device_id, content_hash, detected_at
     FROM node_sync_conflicts
     WHERE conflict_version_id = ?`
  ).get('phone#7');

  expect(row).toEqual({
    conflict_version_id: 'phone#7',
    object_id: 'node-1',
    parent_version_id: 'desktop#3',
    device_id: 'phone',
    content_hash: 'hash-conflict',
    detected_at: '2026-04-21T12:00:00.000Z'
  });
});
