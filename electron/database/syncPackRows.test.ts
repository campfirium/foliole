// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-pack-rows-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { loadPackRows } from './syncPackRows.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-pack-rows-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('loads reading and review state as state-only sync pack metadata', () => {
  insertNodeSyncState();
  openDatabaseConnection().driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('node_review', 'node-1', 3, 'review-hash', 'desktop', '2026-04-27T00:03:00.000Z', 0)`
  );
  openDatabaseConnection().driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('node_reading', 'node-1', 4, 'reading-hash', 'desktop', '2026-04-27T00:04:00.000Z', 0)`
  );
  openDatabaseConnection().driver.execute(
    `INSERT INTO setting_records (
       key, scope, platform, form_factor, device_id, value_json, content_hash, updated_at
     ) VALUES ('app_settings', 'user_space', 'windows', 'desktop', '*', '{"theme":"dark"}',
       'setting-hash', '2026-04-27T00:05:00.000Z')`
  );
  openDatabaseConnection().driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('setting', 'user_space:windows:desktop:*:app_settings', 5, 'setting-hash',
       'desktop', '2026-04-27T00:05:00.000Z', 0)`
  );
  openDatabaseConnection().driver.execute(
    `INSERT INTO workspace_meta (key, value, updated_at)
     VALUES ('active_node_id', 'node-1', '2026-04-27T00:06:00.000Z')`
  );
  openDatabaseConnection().driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('view_state', 'session_resume:windows:desktop:desktop-test:active_node', 6, 'view-hash',
       'desktop-test', '2026-04-27T00:06:00.000Z', 0)`
  );

  expect(loadPackRows(0, 6)).toMatchObject({
    contentBlobs: [],
    externalDocuments: [],
    nodes: [{ id: 'node-1' }],
    stateRows: [
      { object_id: 'node-1', object_type: 'node', state_seq: 1 },
      { object_id: 'node-1', object_type: 'node_review', state_seq: 3 },
      { object_id: 'node-1', object_type: 'node_reading', state_seq: 4 },
      { object_id: 'user_space:windows:desktop:*:app_settings', object_type: 'setting', state_seq: 5 },
      { object_id: 'session_resume:windows:desktop:desktop-test:active_node', object_type: 'view_state', state_seq: 6 }
    ],
    syncObjects: [
      { object_id: 'node-1', object_type: 'node_review' },
      { object_id: 'node-1', object_type: 'node_reading' },
      { object_id: 'user_space:windows:desktop:*:app_settings', object_type: 'setting' },
      { object_id: 'session_resume:windows:desktop:desktop-test:active_node', object_type: 'view_state' }
    ]
  });
});

function insertNodeSyncState() {
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES ('node-1', 'topic', 'Node 1', '', '2026-04-27T00:00:00.000Z', '2026-04-27T00:00:00.000Z')`
  );
  openDatabaseConnection().driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('node', 'node-1', 1, 'node-hash', 'desktop', '2026-04-27T00:00:00.000Z', 0)`
  );
}

it('loads only payload objects that match changed state row pairs', () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO attachments (id, original_name, mime_type, size_bytes, created_at)
     VALUES ('att-1', 'cover.png', 'image/png', 12, '2026-04-27T00:01:00.000Z')`
  );
  driver.execute(
    `INSERT INTO import_sources (
       source_fingerprint, provider, source_kind, source_name, source_locator,
       first_imported_at, last_imported_at, last_content_fingerprint, latest_node_id
     ) VALUES
       ('source-1', 'manual', 'markdown', 'notes.md', '/notes.md',
        '2026-04-27T00:02:00.000Z', '2026-04-27T00:02:00.000Z', 'hash-1', NULL),
       ('att-1', 'manual', 'markdown', 'stale.md', '/stale.md',
        '2026-04-27T00:03:00.000Z', '2026-04-27T00:03:00.000Z', 'hash-stale', NULL)`
  );
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES
       ('attachment', 'att-1', 1, 'attachment-hash', 'desktop', '2026-04-27T00:01:00.000Z', 0),
       ('import_source', 'source-1', 2, 'source-hash', 'desktop', '2026-04-27T00:02:00.000Z', 0),
       ('import_source', 'att-1', 99, 'stale-source-hash', 'desktop', '2026-04-27T00:03:00.000Z', 0)`
  );

  expect(loadPackRows(0, 2).syncObjects.map((row) => `${row.object_type}:${row.object_id}`)).toEqual([
    'attachment:att-1',
    'import_source:source-1'
  ]);
});

it('does not pack learning state rows when the node entity is gone', () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES
       ('node_reading', 'deleted-node', 7, 'reading-hash', 'desktop', '2026-04-27T00:07:00.000Z', 0),
       ('node_review', 'deleted-node', 8, 'review-hash', 'desktop', '2026-04-27T00:08:00.000Z', 0)`
  );

  expect(loadPackRows(0, 8)).toMatchObject({
    nodes: [],
    stateRows: [],
    syncObjects: []
  });
});

it('does not pack live node state rows when the node payload is gone', () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, deleted_at, sync_dirty
     ) VALUES
       ('node', 'missing-live-node', 9, 'live-hash', 'desktop', '2026-04-27T00:09:00.000Z', NULL, 0),
       ('node', 'missing-deleted-node', 10, 'deleted-hash', 'desktop', '2026-04-27T00:10:00.000Z',
        '2026-04-27T00:10:00.000Z', 0)`
  );

  expect(loadPackRows(0, 10).stateRows.map((row) => `${row.object_type}:${row.object_id}`)).toEqual([
    'node:missing-deleted-node'
  ]);
});
