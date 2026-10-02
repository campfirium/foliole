// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
const failure = vi.hoisted(() => ({ guard: false, reapply: false }));
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: path.join(root, 'data'), app_cache_dir: path.join(root, 'cache'),
  app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs')
}) }));
vi.mock('./backupSettings.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./backupSettings.js')>();
  return { ...original, reapplyBackupSettingsAfterRestore: (...args:
    Parameters<typeof original.reapplyBackupSettingsAfterRestore>) => {
    if (failure.reapply) { failure.reapply = false; throw new Error('injected restore failure'); }
    return original.reapplyBackupSettingsAfterRestore(...args);
  } };
});
vi.mock('./readwiseOwnerGuard.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./readwiseOwnerGuard.js')>();
  return { ...original, saveReadwiseOwnerGuard: (...args:
    Parameters<typeof original.saveReadwiseOwnerGuard>) => {
    if (failure.guard) { failure.guard = false; throw new Error('injected owner guard write failure'); }
    return original.saveReadwiseOwnerGuard(...args);
  } };
});

import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { isDesktopCompanionSyncPaused } from '../sync/desktopCompanionSyncPreference.js';
import { resolveReadwiseJoinDecision } from '../sync/readwiseGroupSetup.js';
import { loadReadwiseHandoffIntent, saveReadwiseHandoffIntent } from '../sync/readwiseHandoffIntent.js';

import { createApplicationDatabaseBackup, restoreApplicationDatabaseBackup } from './backupRestore.js';
import { loadBackupRestorePendingSync } from './backupRestorePendingSync.js';
import { inspectBackupRestoreSync } from './backupRestoreSyncPreview.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { loadReadwiseHostAssignment } from './readwiseHostAssignment.js';
import { loadReadwiseOwnerGuard, saveReadwiseOwnerGuard } from './readwiseOwnerGuard.js';
import { loadJsonSetting, saveJsonSetting } from './settingsStore.js';
import { createDesktopSyncGroup, loadDesktopSyncGroup, registerSyncGroupDevice } from './syncGroupStore.js';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-restore-readwise-owner-'));
  vi.stubEnv('FOLIOLE_ELECTRON_TEST_STATE_ROOT', root);
  initializeDatabase();
});
afterEach(async () => {
  failure.guard = false;
  failure.reapply = false;
  vi.restoreAllMocks();
  closeDatabaseConnection();
  vi.unstubAllEnvs();
  await fs.rm(root, { recursive: true, force: true });
});

function group(id: string) {
  const device = createSyncGroupDeviceIdentity({ device_anchor: '11111111-1111-4111-8111-111111111111',
    group_id: id, library_path: openDatabaseConnection().dbPath, path_flavor: 'posix' });
  const result = createDesktopSyncGroup({ device, deviceName: 'This Mac', platform: 'darwin' });
  const remote = createSyncGroupDeviceIdentity({ device_anchor: '22222222-2222-4222-8222-222222222222',
    group_id: id, library_path: 'D:\\Library\\foliole.db', path_flavor: 'windows' });
  registerSyncGroupDevice({ device: remote, deviceName: 'Other desktop', platform: 'win32' });
  return { group: result, remote };
}

function makeLocalOwner(epoch = 7) {
  const current = loadDesktopSyncGroup()!;
  saveReadwiseOwnerGuard({ epoch, groupId: current.group_id, mode: 'relay',
    ownerId: current.local_device_identity_key, state: 'active', targetId: null });
  saveJsonSetting('readwise_active_host', { device_identity_key: current.local_device_identity_key,
    host_name: 'This Mac', epoch, selection_source: 'chosen' });
  expect(loadReadwiseHostAssignment().is_active).toBe(true);
}

async function restore(file: string, source: 'backup' | 'current' = 'current', action: 'pause' | 'local' = 'pause') {
  const preview = await inspectBackupRestoreSync(file);
  await restoreApplicationDatabaseBackup({ sourcePath: file,
    choice: { source, action, revision: preview.revision } });
}

async function expectLocalOwnerAfterReopen() {
  const localId = loadDesktopSyncGroup()?.local_device_identity_key ?? null;
  expect(loadReadwiseHostAssignment()).toMatchObject({ is_active: true, legacy_unassigned: false,
    active_device_identity_key: localId, handoff_pending: false, activation_blocked_reason: null });
  if (localId) {
    expect(isDesktopCompanionSyncPaused()).toBe(true);
    expect(loadBackupRestorePendingSync()).not.toBeNull();
    expect(await resolveReadwiseJoinDecision()).toEqual({ kind: 'none', devices: [] });
  }
  closeDatabaseConnection();
  initializeDatabase();
  expect(loadReadwiseHostAssignment()).toMatchObject({ is_active: true, legacy_unassigned: false,
    active_device_identity_key: localId, handoff_pending: false });
}

it('retains this device for an old backup while sync is paused and another member is offline', async () => {
  group('same');
  const backup = await createApplicationDatabaseBackup();
  makeLocalOwner();
  await restore(backup.destinationPath);
  await expectLocalOwnerAfterReopen();
  expect(openDatabaseConnection().driver.queryOne(`SELECT value_json FROM setting_records
    WHERE key = 'readwise_active_host'`)).toEqual({ value_json: JSON.stringify(loadJsonSetting('readwise_active_host')) });
});

for (const missing of [null, {}, { host_name: 'Invalid owner', epoch: -1 }]) {
  it(`fills invalid owner information ${JSON.stringify(missing)} from the previous local responsibility`, async () => {
    group('same');
    saveJsonSetting('readwise_active_host', missing);
    const backup = await createApplicationDatabaseBackup();
    makeLocalOwner();
    await restore(backup.destinationPath);
    await expectLocalOwnerAfterReopen();
  });
}

it('uses this device in the restored group even when that group differs from the current group', async () => {
  const old = group('backup');
  const backup = await createApplicationDatabaseBackup();
  saveReadwiseOwnerGuard({ epoch: 12, groupId: 'backup', mode: 'relay',
    ownerId: old.group.local_device_identity_key, state: 'relinquished',
    targetId: old.group.local_device_identity_key });
  saveReadwiseHandoffIntent({ dbPath: openDatabaseConnection().dbPath, groupId: 'backup', mode: 'relay',
    ownerId: null, epoch: 0, targetId: old.group.local_device_identity_key }, 'backup');
  openDatabaseConnection().driver.execute('DELETE FROM sync_group_local_state');
  group('current');
  makeLocalOwner();
  await restore(backup.destinationPath, 'backup');
  expect(loadDesktopSyncGroup()?.group_id).toBe('backup');
  expect(loadReadwiseOwnerGuard('backup')).toMatchObject({ epoch: 13, state: 'active',
    ownerId: loadDesktopSyncGroup()?.local_device_identity_key });
  expect(loadReadwiseHandoffIntent('backup')).toBeNull();
  await expectLocalOwnerAfterReopen();
});

for (const owner of [{ host_name: 'Other desktop' },
  { device_identity_key: 'other-owner', host_name: 'Other desktop', epoch: 3 }]) {
  it(`keeps the backup's explicit owner ${JSON.stringify(owner)}`, async () => {
    group('same');
    saveJsonSetting('readwise_active_host', owner);
    const backup = await createApplicationDatabaseBackup();
    makeLocalOwner();
    const guard = loadReadwiseOwnerGuard('same');
    await restore(backup.destinationPath);
    expect(loadJsonSetting('readwise_active_host')).toEqual(owner);
    expect(loadReadwiseHostAssignment().is_active).toBe(false);
    expect(loadReadwiseOwnerGuard('same')).toEqual(guard);
  });
}

it('does not nominate this device when it was not responsible before restoring', async () => {
  const { remote } = group('same');
  const backup = await createApplicationDatabaseBackup();
  saveJsonSetting('readwise_active_host', { host_name: 'Other desktop', device_identity_key: remote.identity_key });
  expect(loadReadwiseHostAssignment().is_active).toBe(false);
  await restore(backup.destinationPath);
  expect(loadReadwiseHostAssignment()).toMatchObject({ is_active: false, legacy_unassigned: true });
});

it('retains local responsibility when the chosen backup has no sync group', async () => {
  const backup = await createApplicationDatabaseBackup();
  group('current');
  makeLocalOwner();
  await restore(backup.destinationPath, 'backup', 'local');
  expect(loadDesktopSyncGroup()).toBeNull();
  await expectLocalOwnerAfterReopen();
});

for (const stage of ['reapply', 'guard'] as const) {
  it(`preserves responsibility and its durable guard when restoration rolls back at ${stage}`, async () => {
    group('same');
    const backup = await createApplicationDatabaseBackup();
    makeLocalOwner();
    const owner = loadJsonSetting('readwise_active_host');
    const guard = loadReadwiseOwnerGuard('same');
    failure[stage] = true;
    await expect(restore(backup.destinationPath)).rejects.toThrow('Your current library has been restored');
    expect(loadJsonSetting('readwise_active_host')).toEqual(owner);
    expect(loadReadwiseOwnerGuard('same')).toEqual(guard);
    expect(loadReadwiseHostAssignment().is_active).toBe(true);
  });
}
