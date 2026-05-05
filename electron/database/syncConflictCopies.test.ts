// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-conflict-copy-tests';

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
import { applySyncNodes } from './syncApply.js';
import { conflictCopyNodeId } from './syncConflictCopies.js';

let tempRoot = '';

function remoteConflictRecord(): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: ['desktop#0'],
    content_hash: 'hash-phone',
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
      opening_text: 'remote opening',
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

function insertDivergentLocalNode() {
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (
       id, kind, title, content, current_version_id, last_modified_by_device_id, sync_dirty, created_at, updated_at
     ) VALUES (?, 'item', 'Local Node', 'local body', ?, 'desktop', 0, ?, ?)`,
    ['node-1', 'desktop#2', '2026-04-21T09:00:00.000Z', '2026-04-21T09:30:00.000Z']
  );
}

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-conflict-copy-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  insertDivergentLocalNode();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

it('creates one inbox conflict copy for divergent remote node versions', () => {
  const record = remoteConflictRecord();
  const copyNodeId = conflictCopyNodeId('phone#1');

  expect(applySyncNodes([record])).toEqual([]);
  expect(applySyncNodes([record])).toEqual([]);

  const connection = openDatabaseConnection();
  expect(connection.sqlite.prepare('SELECT content FROM nodes WHERE id = ?').get('node-1')).toEqual({
    content: 'local body'
  });
  expect(
    connection.sqlite
      .prepare('SELECT parent_id, kind, title, content, sync_dirty FROM nodes WHERE id = ?')
      .get(copyNodeId)
  ).toEqual({
    content: 'remote body',
    kind: 'topic',
    parent_id: 'special-inbox',
    sync_dirty: 0,
    title: 'Remote Node (conflict copy - Android)'
  });
  expect(connection.sqlite.prepare('SELECT COUNT(*) AS count FROM nodes WHERE id LIKE ?').get('conflict-copy-%'))
    .toEqual({ count: 1 });
  expect(connection.sqlite.prepare('SELECT node_id, position FROM node_order WHERE node_id = ?').get(copyNodeId))
    .toEqual({ node_id: copyNodeId, position: 0 });
  expect(
    connection.sqlite
      .prepare('SELECT object_id, device_id, parent_version_id FROM node_sync_versions WHERE object_id = ?')
      .get(copyNodeId)
  ).toEqual({
    device_id: expect.stringMatching(/^desktop-/),
    object_id: copyNodeId,
    parent_version_id: null
  });

  connection.sqlite.prepare('DELETE FROM node_order WHERE node_id = ?').run(copyNodeId);
  connection.sqlite.prepare('DELETE FROM sync_object_state WHERE object_type = ? AND object_id = ?').run('node', copyNodeId);
  connection.sqlite.prepare('DELETE FROM nodes WHERE id = ?').run(copyNodeId);
  connection.sqlite.prepare('DELETE FROM node_sync_versions WHERE object_id = ?').run(copyNodeId);
  expect(applySyncNodes([record])).toEqual([]);
  expect(connection.sqlite.prepare('SELECT COUNT(*) AS count FROM nodes WHERE id = ?').get(copyNodeId))
    .toEqual({ count: 0 });
});
