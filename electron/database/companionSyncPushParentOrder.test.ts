// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let appDataDir = '/tmp/foliole-companion-order-push';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'),
    app_data_dir: appDataDir,
    app_log_dir: path.join(appDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import { parentChildOrderSyncAdapter } from '../../src/shared/platform/companionSyncPushProtocol.js';

import { applyCompanionSyncPushAsync } from './companionSyncPushAsyncApply.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

let root = '';
const parentId = 'parent';
const originalId = 'highlight';
const copyId = 'highlight~copy';

function orderHash(childIds: string[]) {
  return computeSyncContentHash('parent_child_order', {
    parent_id: parentId, child_ids_json: JSON.stringify(childIds)
  });
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-order-push-'));
  appDataDir = path.join(root, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO parent_child_order (parent_id, child_ids_json, updated_at)
    VALUES (?, ?, ?)`, [parentId, JSON.stringify([originalId]), '2026-09-28T00:00:00.000Z']);
  driver.execute(`INSERT INTO sync_object_state (object_type, object_id, state_seq,
    content_hash, last_modified_by_host_name, updated_at, sync_dirty)
    VALUES ('parent_child_order', ?, 1, ?, 'desktop', '2026-09-28T00:00:00.000Z', 0)`,
  [parentId, orderHash([originalId])]);
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it('pushes the conflict copy order while retaining the original branch and confirming replay', async () => {
  const childIds = [originalId, copyId];
  const item = parentChildOrderSyncAdapter.buildPushPayload({
    base_content_hash: orderHash([originalId]), content_hash: orderHash(childIds),
    deleted_at: null, last_modified_by_host_name: 'android', object_id: parentId,
    object_type: 'parent_child_order',
    payload_json: JSON.stringify({ parent_id: parentId, child_ids_json: JSON.stringify(childIds) }),
    state_seq: 2, updated_at: '2026-09-28T00:01:00.000Z'
  });

  const first = await applyCompanionSyncPushAsync([item], 'android');
  const replay = await applyCompanionSyncPushAsync([item], 'android');

  expect(first.appliedObjectIds).toEqual([`parent_child_order:${parentId}`]);
  expect(first.acks).toMatchObject([{ status: 'accepted' }]);
  expect(replay.acks).toMatchObject([{ status: 'already_applied' }]);
  expect(openDatabaseConnection().driver.queryOne<{ child_ids_json: string }>(
    'SELECT child_ids_json FROM parent_child_order WHERE parent_id = ?', [parentId]
  )).toEqual({ child_ids_json: JSON.stringify(childIds) });
});
