// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-sync-object-apply-view-state-tests';

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
import { applySyncObjects } from './syncObjectApply.js';

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-sync-object-apply-view-state-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function insertNode(nodeId: string) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES (?, 'item', ?, '', ?, ?)`,
    [nodeId, nodeId, '2026-04-21T10:00:00.000Z', '2026-04-21T10:00:00.000Z']
  );
}

it('applies legacy mobile view state payloads as user scroll source', () => {
  insertNode('node-1');

  applySyncObjects([{
    content_hash: 'hash-active-view',
    deleted_at: null,
    object_id: 'session_resume:android:phone:android-test:active_node',
    object_type: 'view_state',
    payload_json: JSON.stringify({ active_node_id: 'node-1' }),
    updated_at: '2026-04-22T08:10:00.000Z'
  }, {
    content_hash: 'hash-node-view',
    deleted_at: null,
    object_id: 'session_resume:android:phone:android-test:node:node-1',
    object_type: 'view_state',
    payload_json: JSON.stringify({ node_id: 'node-1', scroll_top: 128 }),
    updated_at: '2026-04-22T08:11:00.000Z'
  }]);

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ value: string }>("SELECT value FROM workspace_meta WHERE key = 'active_node_id'"))
    .toEqual({ value: 'node-1' });
  expect(driver.queryOne<{ device_id: string; scroll_top: number; source: string }>(
    'SELECT device_id, scroll_top, source FROM node_view_state WHERE node_id = ?',
    ['node-1']
  )).toEqual({ device_id: 'android-test', scroll_top: 128, source: 'user-scroll' });
});

it('marks sourced view state sync payloads as sync apply writes', () => {
  insertNode('node-1');

  applySyncObjects([{
    content_hash: 'hash-node-view',
    deleted_at: null,
    object_id: 'session_resume:android:phone:android-test:node:node-1',
    object_type: 'view_state',
    payload_json: JSON.stringify({
      node_id: 'node-1',
      scroll_top: 128,
      selection_from: null,
      selection_to: null,
      source: 'user-scroll'
    }),
    updated_at: '2026-04-22T08:11:00.000Z'
  }]);

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ source: string }>(
    'SELECT source FROM node_view_state WHERE node_id = ? AND device_id = ?',
    ['node-1', 'android-test']
  )).toEqual({ source: 'sync-apply' });
});
