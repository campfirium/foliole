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

type SyncPushPayload = import('./companionSyncPushApply.js').CompanionSyncPushPayload;

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-companion-sync-push-async-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
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

describe('companion sync push async apply', () => {
  it('accepts state object pushes through the shared async executor', async () => {
    const result = await applyCompanionSyncPushAsync([createSettingPush()]);

    expect(result.appliedObjectIds).toEqual(['setting:device:android:phone:*:app_settings']);
    expect(result.acks).toMatchObject([{ stateSeq: 2, status: 'accepted' }]);
    expect(openDatabaseConnection().driver.queryOne<{ value_json: string }>(
      `SELECT value_json FROM setting_records WHERE key = 'app_settings'`
    )).toEqual({ value_json: '{"theme":"dark"}' });
  });

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
});
