// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let mockedAppDataDir = '/tmp/foliole-readwise-host-tests';
const apiState = vi.hoisted(() => ({
  conflictReasons: [] as string[], mode: 'relay' as 'api' | 'relay', ready: false
}));

vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: mockedAppDataDir,
    app_cache_dir: path.join(mockedAppDataDir, 'cache'),
    app_config_dir: path.join(mockedAppDataDir, 'config'),
    app_log_dir: path.join(mockedAppDataDir, 'logs')
  })
}));
vi.mock('../import/readwiseApiConnectionState.js', () => ({
  isStoredReadwiseApiConnectionReady: () => apiState.ready
}));
vi.mock('./readwiseSourceMode.js', () => ({
  ensureReadwiseSourceModeInitialized: () => undefined,
  loadReadwiseSourceModeState: () => ({
    conflictReasons: apiState.conflictReasons,
    mode: apiState.mode
  })
}));

import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { upsertDesktopSource } from './desktopSources.js';
import { initializeDatabase } from './migrate.js';
import {
  activateReadwiseOnThisHost,
  canCurrentHostRunReadwise,
  loadReadwiseHostAssignment
} from './readwiseHostAssignment.js';
import { saveReadwiseOwnerGuard } from './readwiseOwnerGuard.js';
import { saveJsonSetting } from './settingsStore.js';

let tempRoot = '';

beforeEach(async () => {
  apiState.mode = 'relay';
  apiState.conflictReasons = [];
  apiState.ready = false;
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-readwise-host-'));
  mockedAppDataDir = path.join(tempRoot, 'app-data');
  initializeDatabase();
});

afterEach(async () => {
  closeDatabaseConnection();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

function expectOwnerSettingSynced() {
  expect(openDatabaseConnection().driver.queryOne<{ sync_dirty: number }>(
    `SELECT s.sync_dirty FROM sync_object_state s
     JOIN setting_records r ON s.object_id = r.scope || ':' || r.platform || ':' || r.form_factor || ':' || r.host_name || ':' || r.key
     WHERE s.object_type = 'setting' AND r.key = 'readwise_active_host'`
  )).toEqual({ sync_dirty: 1 });
}

async function makeRelaySourceReady() {
  const rootPath = path.join(tempRoot, 'Readwise');
  await fs.mkdir(rootPath, { recursive: true });
  upsertDesktopSource({
    configRef: 'readwise-a', rootPath, sourceType: 'readwise',
    typeSettings: { keepState: 'draft' }, updatedAt: 'now'
  });
}

it('pauses an unassigned workgroup and rejects a switch without a handoff', async () => {
  const currentHost = 'This Mac';
  const driver = openDatabaseConnection().driver;
  driver.execute(
    `INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at)
     VALUES ('group', 'Workgroup', 'workgroup-key', 'now', 'now')`
  );
  driver.execute(
    `INSERT INTO sync_group_local_state
       (singleton_id, group_id, local_device_identity_key, state, updated_at)
     VALUES (1, 'group', 'device-this-mac', 'active', 'now')`
  );
  const devices: Array<[string, string]> = [
    ['device-this-mac', currentHost],
    ['device-office-pc', 'Office PC']
  ];
  for (const [deviceId, hostName] of devices) {
    driver.execute(
      `INSERT INTO sync_group_devices
        (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
         platform, state, joined_at, left_at, last_seen_at, updated_at)
       VALUES ('group', ?, ?, ?, ?, 'darwin', 'active', 'now', NULL, 'now', 'now')`,
      [deviceId, `${deviceId}-anchor`, `/library/${deviceId}`, hostName]
    );
  }
  expect(loadReadwiseHostAssignment()).toMatchObject({
    hosts: [
      { host_name: 'Office PC', platform: 'darwin' },
      { host_name: currentHost, platform: 'darwin' }
    ],
    is_active: false,
    legacy_unassigned: true,
    activation_blocked_reason: 'connection-unavailable'
  });
  await makeRelaySourceReady();
  expect(loadReadwiseHostAssignment()).toMatchObject({
    is_active: false, activation_blocked_reason: 'group-quiescence-required'
  });
  expect(canCurrentHostRunReadwise()).toBe(false);
  saveJsonSetting('readwise_active_host', { host_name: 'Office PC' });

  expect(loadReadwiseHostAssignment()).toMatchObject({
    active_host_name: 'Office PC', current_host_name: currentHost, is_active: false,
    legacy_unassigned: false, activation_blocked_reason: 'handoff-required'
  });
  expect(canCurrentHostRunReadwise()).toBe(false);
  expect(() => activateReadwiseOnThisHost()).toThrow('readwise_handoff-required');

  driver.execute("UPDATE sync_group_devices SET state = 'left' WHERE device_identity_key = 'device-office-pc'");
  saveJsonSetting('readwise_active_host', null);
  expect(activateReadwiseOnThisHost()).toMatchObject({
    active_host_name: currentHost, active_device_identity_key: 'device-this-mac',
    current_host_name: currentHost, is_active: true, legacy_unassigned: false
  });
  expectOwnerSettingSynced();
  saveReadwiseOwnerGuard({ epoch: 1, groupId: 'group', mode: 'relay',
    ownerId: 'device-this-mac', state: 'relinquished', targetId: 'device-office-pc' });
  expect(loadReadwiseHostAssignment()).toMatchObject({
    is_active: false, activation_blocked_reason: 'handoff-in-progress'
  });
  expect(canCurrentHostRunReadwise()).toBe(false);
});

it('does not replace a newer local stop record after an unassigned library rollback', async () => {
  const driver = openDatabaseConnection().driver;
  driver.execute(`INSERT INTO sync_groups (group_id, display_name, workgroup_key, created_at, updated_at)
    VALUES ('group', 'Workgroup', 'workgroup-key', 'now', 'now')`);
  driver.execute(`INSERT INTO sync_group_local_state
    (singleton_id, group_id, local_device_identity_key, state, updated_at)
    VALUES (1, 'group', 'device-this-mac', 'active', 'now')`);
  driver.execute(`INSERT INTO sync_group_devices
    (group_id, device_identity_key, device_anchor, canonical_library_path, device_name,
     platform, state, joined_at, left_at, last_seen_at, updated_at)
    VALUES ('group', 'device-this-mac', 'anchor', '/library/mac', 'This Mac',
      'macOS', 'active', 'now', NULL, 'now', 'now')`);
  await makeRelaySourceReady();
  saveReadwiseOwnerGuard({ epoch: 3, groupId: 'group', mode: 'relay',
    ownerId: 'device-this-mac', state: 'relinquished', targetId: 'other-device' });
  expect(() => activateReadwiseOnThisHost()).toThrow('readwise_guard-history');
  expect(loadReadwiseHostAssignment()).toMatchObject({ is_active: false,
    legacy_unassigned: true, activation_blocked_reason: 'guard-history' });
});

it('runs Readwise for the current Host when another enabled category directory is absent', async () => {
  const rootPath = path.join(tempRoot, 'Readwise');
  await fs.mkdir(rootPath, { recursive: true });
  upsertDesktopSource({
    configRef: 'readwise-a', rootPath, sourceType: 'readwise', typeSettings: { keepState: 'enabled' }, updatedAt: 'now'
  });
  upsertDesktopSource({
    configRef: 'readwise-missing',
    rootPath: path.join(tempRoot, 'Missing'),
    sourceType: 'readwise',
    typeSettings: { keepState: 'enabled' },
    updatedAt: 'now'
  });
  expect(canCurrentHostRunReadwise()).toBe(true);
  upsertDesktopSource({
    configRef: 'readwise-remote',
    hostName: 'Other Mac',
    rootPath,
    sourceType: 'readwise',
    typeSettings: { keepState: 'enabled' },
    updatedAt: 'later'
  });
  expect(canCurrentHostRunReadwise()).toBe(true);
  openDatabaseConnection().driver.execute(
    "UPDATE desktop_sources SET host_name = 'Other Mac' WHERE source_type = 'readwise'"
  );
  expect(canCurrentHostRunReadwise()).toBe(false);
});

it('uses API readiness instead of folder readiness in explicit API mode', async () => {
  const rootPath = path.join(tempRoot, 'Readwise');
  await fs.mkdir(rootPath, { recursive: true });
  upsertDesktopSource({
    configRef: 'readwise-a', rootPath, sourceType: 'readwise', typeSettings: { keepState: 'enabled' }, updatedAt: 'now'
  });
  apiState.mode = 'api';

  expect(canCurrentHostRunReadwise()).toBe(false);
  apiState.ready = true;
  expect(canCurrentHostRunReadwise()).toBe(true);
  apiState.mode = 'relay';
  apiState.ready = false;
  expect(canCurrentHostRunReadwise()).toBe(true);
});

it('fails closed when a completed cutover conflicts with relay mode', () => {
  saveJsonSetting('readwise_source_cutover', {
    completedAt: '2026-09-08T00:00:00.000Z',
    migratedCount: 12,
    sourceHost: 'This Mac',
    unmatchedCount: 0,
    version: 1
  });
  apiState.mode = 'relay';
  apiState.conflictReasons = ['completion_conflicts_with_mode'];
  apiState.ready = true;

  expect(canCurrentHostRunReadwise()).toBe(false);
});

it('blocks ordinary relay and API execution while migration is in progress', () => {
  saveJsonSetting('readwise_source_cutover', {
    completedAt: '2026-09-09T00:00:00.000Z',
    completedCandidateCount: 2,
    migratedCount: 1,
    sourceHost: 'This Mac',
    startedAt: '2026-09-09T00:00:00.000Z',
    status: 'migration-in-progress',
    totalCandidateCount: 8,
    unmatchedCount: 0,
    version: 1
  });
  apiState.mode = 'relay';
  apiState.ready = true;

  expect(canCurrentHostRunReadwise('relay')).toBe(false);
  expect(canCurrentHostRunReadwise('api')).toBe(false);
});
