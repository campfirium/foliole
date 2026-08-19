// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-node-tombstone-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { loadSyncNodeVersionsSince } from './syncNodes.js';

let tempRoot = '';

describe('sync node tombstone streams', () => {
  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-node-tombstone-'));
    mockedAppDataDir = path.join(tempRoot, 'app-data');
    initializeDatabaseConnection(openDatabaseConnection());
  });

  afterEach(async () => {
    closeDatabaseConnection();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('streams permanent-delete tombstones after their own created cursor', () => {
    insertTombstoneFixture();

    expect(loadSyncNodeVersionsSince({ createdAt: '2026-04-21T11:59:00.000Z', versionId: 'desktop#2' }, 10))
      .toEqual([
        expect.objectContaining({
          ancestor_version_ids: ['desktop#2'],
          is_tombstone: true,
          object_id: 'node-deleted',
          parent_version_id: 'desktop#2',
          version_created_at: '2026-04-21T12:00:00.000Z',
          version_id: 'desktop#delete'
        })
      ]);
  });
});

function insertTombstoneFixture() {
  openDatabaseConnection().driver.execute(
    `INSERT INTO node_sync_tombstones (
       node_id, version_id, parent_version_id, host_name, content_hash, snapshot_json, deleted_at, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'node-deleted',
      'desktop#delete',
      'desktop#2',
      'desktop',
      'hash-delete',
      tombstoneSnapshotJson(),
      '2026-04-21T12:00:00.000Z',
      '2026-04-21T12:00:00.000Z'
    ]
  );
}

function tombstoneSnapshotJson() {
  return JSON.stringify({
    anchor_link: null,
    attachments: [],
    content: '',
    created_at: '2026-04-21T10:00:00.000Z',
    deleted_at: '2026-04-21T12:00:00.000Z',
    desired_retention: null,
    hide_title_heading: false,
    id: 'node-deleted',
    image_regions: null,
    is_title_manual: true,
    kind: 'item',
    opening_text: null,
    parent_id: null,
    position: null,
    priority: null,
    reveal: null,
    title: 'Deleted node',
    updated_at: '2026-04-21T12:00:00.000Z',
    virtual_filter: null
  });
}
