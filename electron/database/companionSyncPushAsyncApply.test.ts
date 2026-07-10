// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-companion-sync-push-async-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { applyCompanionSyncPushAsync } from './companionSyncPushAsyncApply.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';

type SyncPushPayload = import('./companionSyncPushTypes.js').CompanionSyncPushPayload;

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-companion-sync-push-async-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
  openDatabaseConnection().driver.execute(
    `INSERT INTO nodes (id, kind, title, content, created_at, updated_at)
     VALUES ('node-1', 'item', 'Node 1', '', '2026-04-30T00:00:00.000Z', '2026-04-30T00:00:00.000Z')`
  );
  saveJsonSetting('device_id', 'desktop-device', '2026-04-30T00:00:00.000Z');
  openDatabaseConnection().driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES ('setting', 'device:android:phone:*:app_settings', 1, 'desktop-base', 'desktop', '2026-04-30T00:00:00.000Z', 0)`
  );
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function createSettingPush(overrides: Partial<SyncPushPayload> = {}): SyncPushPayload {
  return {
    base: { baseContentHash: 'desktop-base', kind: 'content_hash' },
    clientOpId: 'setting:device:android:phone:*:app_settings:13',
    contentHash: 'android-next',
    deletedAt: null,
    identity: { objectId: 'device:android:phone:*:app_settings', objectType: 'setting', scope: 'device' },
    payloadJson: JSON.stringify({
      device_id: '*',
      form_factor: 'phone',
      key: 'app_settings',
      platform: 'android',
      scope: 'device',
      value_json: '{"theme":"dark"}'
    }),
    updatedAt: '2026-04-30T01:00:00.000Z',
    ...overrides
  };
}

function createReviewLogPush(opId = 'op-1'): SyncPushPayload {
  return {
    base: { kind: 'op_id', opId },
    clientOpId: `review_log:${opId}`,
    identity: { objectId: opId, objectType: 'review_log', scope: 'workspace' },
    payloadJson: JSON.stringify({
      device_id: 'android-device',
      difficulty_after: 3,
      difficulty_before: 2,
      due_after: '2026-05-01T00:00:00.000Z',
      due_before: '2026-04-30T00:00:00.000Z',
      grade: 3,
      id: `review-${opId}`,
      node_id: 'node-1',
      op_id: opId,
      reviewed_at: '2026-04-30T01:00:00.000Z',
      scheduler_version: 'ts-fsrs@4',
      stability_after: 4,
      stability_before: 3
    })
  };
}

async function verifyDesktopWorkspaceSettingPush() {
  const result = await applyCompanionSyncPushAsync([createSettingPush({
    base: { baseContentHash: null, kind: 'content_hash' },
    clientOpId: 'setting:user_space:windows:desktop:*:app_settings:14',
    contentHash: 'desktop-next',
    identity: { objectId: 'user_space:windows:desktop:*:app_settings', objectType: 'setting', scope: 'user_space' },
    payloadJson: JSON.stringify({
      device_id: '*', form_factor: 'desktop', key: 'app_settings', platform: 'windows',
      scope: 'user_space', value_json: '{"theme":"dark"}'
    })
  })]);

  expect(result.acks).toMatchObject([{ status: 'accepted' }]);
  expect(loadJsonSetting('app_settings')).toEqual({ theme: 'dark' });
}

describe('companion sync push async apply', () => {
  it('accepts state object pushes through the shared async executor', async () => {
    const result = await applyCompanionSyncPushAsync([createSettingPush()]);

    expect(result.appliedObjectIds).toEqual(['setting:device:android:phone:*:app_settings']);
    expect(result.acks).toMatchObject([{ stateSeq: 2, status: 'accepted' }]);
    expect(openDatabaseConnection().driver.queryOne<{ value_json: string }>(
      `SELECT value_json FROM setting_records WHERE key = 'app_settings'`
    )).toEqual({ value_json: '{"theme":"dark"}' });
    expect(loadJsonSetting('app_settings')).toBeNull();
  });

  it('materializes accepted desktop workspace setting pushes', verifyDesktopWorkspaceSettingPush);

  it('reports content-hash conflicts without applying state object pushes', async () => {
    const result = await applyCompanionSyncPushAsync([createSettingPush({
      base: { baseContentHash: 'stale-base', kind: 'content_hash' }
    })]);

    expect(result.appliedObjectIds).toEqual([]);
    expect(result.acks).toMatchObject([{ conflictReason: 'base_content_hash_mismatch', status: 'conflict' }]);
    expect(openDatabaseConnection().driver.queryOne(
      `SELECT value_json FROM setting_records WHERE key = 'app_settings'`
    )).toBeUndefined();
  });

  it('accepts and deduplicates review log pushes through the async executor', async () => {
    const first = createReviewLogPush('op-async-1');
    const duplicate = createReviewLogPush('op-async-1');

    await expect(applyCompanionSyncPushAsync([first])).resolves.toMatchObject({
      acks: [{ status: 'accepted' }],
      appliedReviewOpIds: ['op-async-1']
    });
    await expect(applyCompanionSyncPushAsync([duplicate])).resolves.toMatchObject({
      acks: [{ status: 'already_applied' }],
      appliedReviewOpIds: []
    });
    expect(openDatabaseConnection().driver.queryOne<{ count: number }>(
      `SELECT COUNT(*) AS count FROM review_log WHERE op_id = 'op-async-1'`
    )).toEqual({ count: 1 });
  });

  it('rejects unsupported push object types without falling back to legacy sync apply', async () => {
    await expect(applyCompanionSyncPushAsync([{
      base: { baseContentHash: null, kind: 'content_hash' },
      clientOpId: 'attachment:att-1:1',
      contentHash: 'hash-att-1',
      identity: { objectId: 'att-1', objectType: 'attachment', scope: 'workspace' },
      payloadJson: '{}',
      updatedAt: '2026-04-30T01:00:00.000Z'
    }])).resolves.toMatchObject({
      acks: [{ conflictReason: 'unsupported_object_type', status: 'rejected' }]
    });
  });
});
