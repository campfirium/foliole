// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let tempRoot = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_cache_dir: path.join(tempRoot, 'cache'), app_config_dir: path.join(tempRoot, 'config'),
  app_data_dir: path.join(tempRoot, 'data'), app_log_dir: path.join(tempRoot, 'logs')
}) }));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';
import { computeSyncContentHash } from '../../lib/core/database/syncState.js';
import {
  buildCanonicalSettingSyncPayload,
  buildCanonicalViewStateSyncPayload
} from '../../lib/core/sync/canonicalPrivateStatePayload.js';

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDesktopDeviceProfileFixture } from './deviceIdentityTestSupport.js';
import { writeSettingRecord } from './settingRecords.js';
import { applySyncObjectsAsync } from './syncObjectApply.js';
import { loadSyncObjects } from './syncObjects.js';
import { writeNodeViewStateSync } from './viewStateSync.js';

const firstTime = '2026-10-05T03:00:00.000Z';
const secondTime = '2026-10-05T04:00:00.000Z';
type CanonicalPrivateStatePayload = ReturnType<typeof buildCanonicalSettingSyncPayload>
  | ReturnType<typeof buildCanonicalViewStateSyncPayload>;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-private-state-canonical-'));
  initializeDatabaseConnection(openDatabaseConnection());
  initializeDesktopDeviceProfileFixture('canonical-host');
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

it('uses the same canonical setting payload for local state and outbound sync', () => {
  const driver = openDatabaseConnection().driver;
  const objectId = 'user_space:windows:desktop:*:review_scheduler_settings';
  writeSettingRecord(driver, { key: 'review_scheduler_settings', updatedAt: firstTime, valueJson: '{"theme":"dark"}' });
  const before = readState('setting', objectId);
  const payload = readPayload(objectId, 'setting');

  expect(before.content_hash).toBe(computeSyncContentHash('setting', payload));
  expect(Object.keys(payload).sort()).toEqual([
    'form_factor', 'host_name', 'key', 'platform', 'scope', 'value_json'
  ]);

  writeSettingRecord(driver, { key: 'review_scheduler_settings', updatedAt: secondTime, valueJson: '{"theme":"dark"}' });
  expect(readState('setting', objectId)).toEqual(before);
});

it('excludes view-state write source and clock from local and outbound hashes', () => {
  const connection = openDatabaseConnection();
  const objectId = 'session_resume:windows:desktop:canonical-host:node:node-1';
  connection.driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES ('node-1', 'item', 'Node', '', ?, ?)`, [firstTime, firstTime]
  );
  writeViewRow('close-flush', firstTime);
  writeNodeViewStateSync(connection, viewInput('close-flush', firstTime));
  const before = readState('view_state', objectId);
  const payload = readPayload(objectId, 'view_state');

  expect(before.content_hash).toBe(computeSyncContentHash('view_state', payload));
  expect(payload).toEqual({
    form_factor: 'desktop', host_name: 'canonical-host', key: 'node:node-1',
    node_id: 'node-1', platform: 'windows', scope: 'session_resume', scroll_top: 128,
    selection_from: null, selection_to: null
  });

  writeViewRow('user-scroll', secondTime);
  writeNodeViewStateSync(connection, viewInput('user-scroll', secondTime));
  expect(readState('view_state', objectId)).toEqual(before);
  expect(readPayload(objectId, 'view_state')).toEqual(payload);
});

it('rejects tampered private-state payloads while applying another object independently', async () => {
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES ('node-1', 'item', 'Node', '', ?, ?)`, [firstTime, firstTime]
  );
  const setting = buildCanonicalSettingSyncPayload({ form_factor: 'desktop', host_name: '*',
    key: 'app_settings', platform: 'windows', scope: 'user_space', value_json: '{"theme":"dark"}' });
  const view = buildCanonicalViewStateSyncPayload({ active_node_id: null, form_factor: 'phone',
    host_name: 'canonical-host', key: 'active_node', platform: 'android', scope: 'session_resume' });
  const applied = await applySyncObjectsAsync([
    syncRecord('setting', 'user_space:windows:desktop:*:app_settings', setting,
      { ...setting, value_json: '{"theme":"light"}' }),
    syncRecord('view_state', 'session_resume:android:phone:canonical-host:active_node', view,
      { ...view, active_node_id: 'tampered-node' }),
    { content_hash: 'unvalidated-open-state', deleted_at: null, object_id: 'node-1',
      object_type: 'node_open_state', payload_json: '{"node_id":"node-1","last_opened_at":"2026-10-05T05:00:00.000Z"}',
      updated_at: '2026-10-05T05:00:00.000Z' }
  ], { hostName: 'canonical-host' });

  expect(applied).toEqual(['node_open_state:node-1']);
  expect(readStateOrNull('setting', 'user_space:windows:desktop:*:app_settings')).toBeNull();
  expect(readStateOrNull('view_state', 'session_resume:android:phone:canonical-host:active_node')).toBeNull();
});

it('rejects private-state tombstones whose hash is not bound to their identity', async () => {
  const objectId = 'user_space:windows:desktop:*:app_settings';
  const applied = await applySyncObjectsAsync([{
    content_hash: computeSyncContentHash('setting', { deleted: true, object_id: `${objectId}-other` }),
    deleted_at: secondTime, object_id: objectId, object_type: 'setting', payload_json: null,
    updated_at: secondTime
  }], { hostName: 'canonical-host' });
  expect(applied).toEqual([]);
  expect(readStateOrNull('setting', objectId)).toBeNull();
});

function syncRecord(objectType: 'setting' | 'view_state', objectId: string,
  hashPayload: CanonicalPrivateStatePayload, sentPayload: Record<string, unknown>) {
  return { content_hash: computeSyncContentHash(objectType, hashPayload), deleted_at: null,
    object_id: objectId, object_type: objectType, payload_json: JSON.stringify(sentPayload), updated_at: secondTime };
}

function writeViewRow(source: string, updatedAt: string) {
  openDatabaseConnection().driver.execute(
    `INSERT OR REPLACE INTO node_view_state
     (node_id, host_name, scroll_top, selection_from, selection_to, source, updated_at)
     VALUES ('node-1', 'canonical-host', 128, NULL, NULL, ?, ?)`, [source, updatedAt]
  );
}

function viewInput(source: 'close-flush' | 'user-scroll', updatedAt: string) {
  return { nodeId: 'node-1', scrollTop: 128, selectionFrom: null, selectionTo: null, source, updatedAt };
}

function readPayload(objectId: string, objectType: 'setting' | 'view_state') {
  const [record] = loadSyncObjects([objectId], [objectType]);
  return JSON.parse(record?.payload_json ?? '{}') as CanonicalPrivateStatePayload;
}

function readState(objectType: string, objectId: string) {
  return openDatabaseConnection().driver.queryOne<{ content_hash: string; state_seq: number; updated_at: string }>(
    'SELECT content_hash, state_seq, updated_at FROM sync_object_state WHERE object_type = ? AND object_id = ?',
    [objectType, objectId]
  )!;
}

function readStateOrNull(objectType: string, objectId: string) {
  return readState(objectType, objectId) ?? null;
}
