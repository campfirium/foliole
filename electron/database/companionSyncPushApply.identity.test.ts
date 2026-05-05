// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-companion-sync-push-identity-tests';

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_data_dir: mockedAppDataDir,
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));

import { initializeDatabaseConnection } from '../../lib/core/database/index.js';

import { applyCompanionSyncPush } from './companionSyncPushApply.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';

type SyncPushPayload = import('./companionSyncPushApply.js').CompanionSyncPushPayload;

let tempRoot = '';

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-companion-sync-push-identity-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabaseConnection(openDatabaseConnection());
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { force: true, recursive: true });
});

function insertBaseState(objectType: 'setting' | 'view_state', objectId: string, contentHash: string) {
  openDatabaseConnection().driver.execute(
    `INSERT INTO sync_object_state (
       object_type, object_id, state_seq, content_hash, last_modified_by_device_id, updated_at, sync_dirty
     ) VALUES (?, ?, 1, ?, 'desktop', '2026-04-30T00:00:00.000Z', 0)`,
    [objectType, objectId, contentHash]
  );
}

function createSettingPush(overrides: Partial<SyncPushPayload> = {}): SyncPushPayload {
  return {
    base: { baseContentHash: 'desktop-setting-base', kind: 'content_hash' },
    clientOpId: 'setting:device:13',
    contentHash: 'android-setting-next',
    deletedAt: null,
    identity: { objectId: 'device', objectType: 'setting', scope: 'device' },
    payloadJson: '{"key":"app_settings","scope":"device","platform":"android","form_factor":"phone","device_id":"*","value_json":"{}"}',
    updatedAt: '2026-04-30T01:02:00.000Z',
    ...overrides
  };
}

function createViewStatePush(overrides: Partial<SyncPushPayload> = {}): SyncPushPayload {
  return {
    base: { baseContentHash: 'desktop-view-base', kind: 'content_hash' },
    clientOpId: 'view_state:session_resume:14',
    contentHash: 'android-view-next',
    deletedAt: null,
    identity: { objectId: 'session_resume:android:phone', objectType: 'view_state', scope: 'session_resume' },
    payloadJson: '{"active_node_id":"node-1"}',
    updatedAt: '2026-04-30T01:03:00.000Z',
    ...overrides
  };
}

describe('companion sync push identity validation', () => {
  it('rejects malformed setting identity before applying payload', () => {
    insertBaseState('setting', 'device', 'desktop-setting-base');

    const result = applyCompanionSyncPush([createSettingPush()]);

    expect(result.appliedObjectIds).toEqual([]);
    expect(result.acks).toMatchObject([{ conflictReason: 'invalid_setting_push', status: 'rejected' }]);
  });

  it('rejects malformed view_state identity before applying payload', () => {
    insertBaseState('view_state', 'session_resume:android:phone', 'desktop-view-base');

    const result = applyCompanionSyncPush([createViewStatePush()]);

    expect(result.appliedObjectIds).toEqual([]);
    expect(result.acks).toMatchObject([{ conflictReason: 'invalid_view_state_push', status: 'rejected' }]);
  });
});
