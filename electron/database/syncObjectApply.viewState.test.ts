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
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { buildCanonicalViewStateSyncPayload } from '../../lib/core/sync/canonicalPrivateStatePayload.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { applySyncObjectsAsync } from './syncObjectApply.js';

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

function insertDeletedNode(nodeId: string) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at, deleted_at)
     VALUES (?, 'item', ?, '', ?, ?, ?)`,
    [nodeId, nodeId, '2026-04-21T10:00:00.000Z', '2026-04-21T10:00:00.000Z', '2026-04-22T08:00:00.000Z']
  );
}

it('applies canonical mobile view state payloads as sync writes', async () => {
  insertNode('node-1');

  await applySyncObjectsAsync([
    viewRecord('active_node', { active_node_id: 'node-1' }, '2026-04-22T08:10:00.000Z'),
    viewRecord('node:node-1', { node_id: 'node-1', scroll_top: 128,
      selection_from: null, selection_to: null }, '2026-04-22T08:11:00.000Z')
  ], { hostName: 'android-test' });

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ value: string }>("SELECT value FROM workspace_meta WHERE key = 'active_node_id'"))
    .toEqual({ value: 'node-1' });
  expect(driver.queryOne<{ host_name: string; scroll_top: number; source: string }>(
    'SELECT host_name, scroll_top, source FROM node_view_state WHERE node_id = ?',
    ['node-1']
  )).toEqual({ host_name: 'android-test', scroll_top: 128, source: 'sync-apply' });
});

it('marks sourced view state sync payloads as sync apply writes', async () => {
  insertNode('node-1');

  await applySyncObjectsAsync([viewRecord('node:node-1', { node_id: 'node-1', scroll_top: 128,
    selection_from: null, selection_to: null }, '2026-04-22T08:11:00.000Z')],
  { hostName: 'android-test' });

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ source: string }>(
    'SELECT source FROM node_view_state WHERE node_id = ? AND host_name = ?',
    ['node-1', 'android-test']
  )).toEqual({ source: 'sync-apply' });
});

it('ignores active node view state for deleted or missing nodes', async () => {
  insertNode('node-1');
  insertDeletedNode('node-deleted');

  await applySyncObjectsAsync([viewRecord('active_node', { active_node_id: 'node-1' },
    '2026-04-22T08:10:00.000Z')], { hostName: 'android-test' });

  await applySyncObjectsAsync([
    viewRecord('active_node', { active_node_id: 'node-deleted' }, '2026-04-22T08:11:00.000Z'),
    viewRecord('active_node', { active_node_id: 'node-missing' }, '2026-04-22T08:12:00.000Z')
  ], { hostName: 'android-test' });

  expect(openDatabaseConnection().driver.queryOne<{ value: string }>(
    "SELECT value FROM workspace_meta WHERE key = 'active_node_id'"
  )).toEqual({ value: 'node-1' });
});

function viewRecord(key: string, state: Record<string, unknown>, updatedAt: string) {
  const payload = buildCanonicalViewStateSyncPayload({
    form_factor: 'phone', host_name: 'android-test', key, platform: 'android',
    scope: 'session_resume', ...state
  } as Parameters<typeof buildCanonicalViewStateSyncPayload>[0]);
  return { content_hash: computeSyncContentHash('view_state', payload), deleted_at: null,
    object_id: `session_resume:android:phone:android-test:${key}`, object_type: 'view_state' as const,
    payload_json: JSON.stringify(payload), updated_at: updatedAt };
}

it('does not apply view state without the matching local Android device id', async () => {
  insertNode('node-1');

  await expect(applySyncObjectsAsync([{
    content_hash: 'hash-active-view',
    deleted_at: null,
    object_id: 'session_resume:android:phone:other-device:active_node',
    object_type: 'view_state',
    payload_json: JSON.stringify({ active_node_id: 'node-1' }),
    updated_at: '2026-04-22T08:10:00.000Z'
  }], { hostName: 'android-test' })).resolves.toEqual([]);

  const driver = openDatabaseConnection().driver;
  expect(driver.queryOne<{ value: string }>("SELECT value FROM workspace_meta WHERE key = 'active_node_id'"))
    .toBeUndefined();
  expect(driver.queryOne<{ count: number }>(
    "SELECT COUNT(*) AS count FROM sync_object_state WHERE object_type = 'view_state'"
  )).toEqual({ count: 0 });
});
