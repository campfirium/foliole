// @vitest-environment node
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let root = '';
vi.mock('../ipc/paths.js', () => ({ resolveAppPaths: () => ({
  app_data_dir: path.join(root, 'data'), app_cache_dir: path.join(root, 'cache'),
  app_config_dir: path.join(root, 'config'), app_log_dir: path.join(root, 'logs')
}) }));

import { createSyncGroupDeviceIdentity, devicePathFlavorFromCanonicalLibraryPath } from '../../lib/platform/syncGroupUnifiedContract.js';
import { isDesktopCompanionSyncParticipating, isDesktopCompanionSyncPaused,
  setDesktopCompanionSyncPaused } from '../sync/desktopCompanionSyncPreference.js';

import { createApplicationDatabaseBackup, restoreApplicationDatabaseBackup } from './backupRestore.js';
import { loadBackupRestorePendingSync } from './backupRestorePendingSync.js';
import { inspectBackupRestoreSync } from './backupRestoreSyncPreview.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { writeRestoreSyncParticipation } from './syncGroupBackupRestore.js';
import { createDesktopSyncGroup, loadDesktopSyncGroup } from './syncGroupStore.js';
import { loadWorkspaceSnapshot } from './workspaceSnapshot.js';

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-restore-choice-'));
  vi.stubEnv('FOLIOLE_ELECTRON_TEST_STATE_ROOT', root);
  initializeDatabase();
  seed('backup');
});
afterEach(async () => {
  closeDatabaseConnection();
  vi.unstubAllEnvs();
  await fs.rm(root, { recursive: true, force: true });
});

function seed(content: string) {
  upsertNodeSnapshot({ nodeId: 'topic', parentNodeId: null, kind: 'topic', title: content,
    content, isTitleManual: true, reveal: null, anchorLink: null, position: 0,
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: new Date().toISOString() });
}
function group(id: string, secret = Buffer.alloc(32, 7).toString('base64url')) {
  const identity = createSyncGroupDeviceIdentity({ device_anchor: '11111111-1111-4111-8111-111111111111',
    group_id: id, library_path: openDatabaseConnection().dbPath,
    path_flavor: devicePathFlavorFromCanonicalLibraryPath(openDatabaseConnection().dbPath) });
  return createDesktopSyncGroup({ device: identity, deviceName: 'This desktop', displayName: 'Same name',
    platform: 'darwin', workgroupKey: secret });
}
function content() {
  return loadWorkspaceSnapshot({ includeBody: true })?.nodesById.topic?.content;
}
async function restore(file: string, source: 'backup' | 'current', action: 'local' | 'pause' | 'overwrite') {
  const preview = await inspectBackupRestoreSync(file);
  return restoreApplicationDatabaseBackup({ sourcePath: file, choice: { source, action, revision: preview.revision } });
}

it('requires an explicit group decision instead of silently keeping the current group', async () => {
  const backup = await createApplicationDatabaseBackup();
  group('current');
  seed('current');
  await expect(restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath })).rejects.toThrow();
  expect(content()).toBe('current');
  expect(loadBackupRestorePendingSync()).toBeNull();
});

it('compares group identity while retaining complete settings in the revision', async () => {
  group('backup');
  const backup = await createApplicationDatabaseBackup();
  const driver = openDatabaseConnection().driver;
  driver.execute("UPDATE sync_groups SET updated_at = 'later'");
  const initial = await inspectBackupRestoreSync(backup.destinationPath);
  expect(initial.same).toBe(true);
  driver.execute('UPDATE sync_groups SET workgroup_key = ?', [Buffer.alloc(32, 8).toString('base64url')]);
  const preview = await inspectBackupRestoreSync(backup.destinationPath);
  expect(preview.same).toBe(true);
  expect(preview.revision).not.toBe(initial.revision);
  expect(preview.backup.group?.name).toBe(preview.current.group?.name);
  expect(JSON.stringify(preview)).not.toContain(Buffer.alloc(32, 7).toString('base64url'));
});

for (const source of ['backup', 'current'] as const) {
  it(`restores the ${source} group when the backup and current groups differ`, async () => {
    group('backup');
    const backup = await createApplicationDatabaseBackup();
    openDatabaseConnection().driver.execute('DELETE FROM sync_group_local_state');
    group('current', Buffer.alloc(32, 8).toString('base64url'));
    seed('current');
    await restore(backup.destinationPath, source, 'overwrite');
    expect(loadDesktopSyncGroup()?.group_id).toBe(source);
    expect(content()).toBe('backup');
    expect(openDatabaseConnection().driver.queryOne('SELECT group_id FROM sync_group_restore_events WHERE applied_at IS NOT NULL'))
      .toEqual({ group_id: source });
  });
}

for (const backupHasGroup of [true, false]) {
  for (const source of ['backup', 'current'] as const) {
    it(`handles backup group=${backupHasGroup}, current group=${!backupHasGroup}, source=${source}`, async () => {
      if (backupHasGroup) group('chosen');
      const backup = await createApplicationDatabaseBackup();
      openDatabaseConnection().driver.execute('DELETE FROM sync_group_local_state');
      if (!backupHasGroup) group('chosen');
      const chosenHasGroup = source === 'backup' ? backupHasGroup : !backupHasGroup;
      await restore(backup.destinationPath, source, chosenHasGroup ? 'pause' : 'local');
      expect(Boolean(loadDesktopSyncGroup())).toBe(chosenHasGroup);
      expect(Boolean(loadBackupRestorePendingSync())).toBe(chosenHasGroup);
      expect(isDesktopCompanionSyncParticipating()).toBe(false);
      expect(content()).toBe('backup');
    });
  }
}

it('persists pause and the overwrite notice across edits, stale settings and database reopen', async () => {
  group('chosen');
  const backup = await createApplicationDatabaseBackup();
  seed('current');
  await restore(backup.destinationPath, 'current', 'pause');
  const pending = loadBackupRestorePendingSync();
  expect(pending?.groupId).toBe('chosen');
  expect(openDatabaseConnection().driver.queryOne('SELECT restore_id FROM sync_group_restore_events')).toBeUndefined();
  seed('edited after restore');
  setDesktopCompanionSyncPaused(false);
  writeRestoreSyncParticipation(openDatabaseConnection().driver, false, true);
  expect(isDesktopCompanionSyncParticipating()).toBe(false);
  closeDatabaseConnection();
  initializeDatabase();
  expect(isDesktopCompanionSyncPaused()).toBe(true);
  expect(loadBackupRestorePendingSync()).toEqual(pending);
  expect(content()).toBe('edited after restore');
});

it('rejects changed configuration before database replacement', async () => {
  const backup = await createApplicationDatabaseBackup();
  const preview = await inspectBackupRestoreSync(backup.destinationPath);
  group('changed');
  seed('current');
  await expect(restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath,
    choice: { source: 'current', action: 'local', revision: preview.revision } })).rejects.toThrow();
  expect(content()).toBe('current');
  expect(loadDesktopSyncGroup()?.group_id).toBe('changed');
});

it('does not consume the pending overwrite if its durable confirmation handoff fails', async () => {
  group('chosen');
  const backup = await createApplicationDatabaseBackup();
  await restore(backup.destinationPath, 'current', 'pause');
  const pending = loadBackupRestorePendingSync()!;
  const { resumeDesktopCompanionSync } = await import('../sync/desktopCompanionSyncParticipation.js');
  const driver = openDatabaseConnection().driver;
  const execute = driver.execute.bind(driver);
  const fault = vi.spyOn(driver, 'execute').mockImplementation((sql, params) => {
    if (sql === 'DELETE FROM settings WHERE key = ?') throw new Error('injected handoff failure');
    return execute(sql, params);
  });
  try {
    expect(() => resumeDesktopCompanionSync({ appVersion: '0.7.14', deviceId: 'local' }, pending.restoreId))
      .toThrow('injected handoff failure');
  } finally { fault.mockRestore(); }
  closeDatabaseConnection();
  initializeDatabase();
  expect(loadBackupRestorePendingSync()).toEqual(pending);
  expect(isDesktopCompanionSyncParticipating()).toBe(false);
  expect(openDatabaseConnection().driver.queryOne('SELECT restore_id FROM sync_group_restore_events')).toBeUndefined();
});

it('rejects array actions rather than treating them as overwrite permission', async () => {
  group('chosen');
  const backup = await createApplicationDatabaseBackup();
  seed('current');
  const preview = await inspectBackupRestoreSync(backup.destinationPath);
  await expect(restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath,
    choice: { source: 'current', action: ['pause'], revision: preview.revision } as unknown as
      import('../../lib/platform/backupRestoreSyncContract.js').BackupRestoreSyncChoice })).rejects.toThrow();
  expect(content()).toBe('current');
  expect(loadBackupRestorePendingSync()).toBeNull();
});

it('restores without a source choice when both sides are ungrouped with different participation settings', async () => {
  const backup = await createApplicationDatabaseBackup();
  writeRestoreSyncParticipation(openDatabaseConnection().driver, true, true);
  seed('current');
  expect((await inspectBackupRestoreSync(backup.destinationPath)).same).toBe(true);
  await restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath });
  expect(content()).toBe('backup');
  expect(loadDesktopSyncGroup()).toBeNull();
  expect(loadBackupRestorePendingSync()).toBeNull();
});

it('keeps current group metadata and credentials for the same group even with a backup source choice', async () => {
  group('same-group');
  const backup = await createApplicationDatabaseBackup();
  const secret = Buffer.alloc(32, 8).toString('base64url');
  const driver = openDatabaseConnection().driver;
  driver.execute('UPDATE sync_groups SET display_name = ?, workgroup_key = ?', ['Current name', secret]);
  driver.execute('UPDATE sync_group_devices SET device_name = ?', ['Current device']);
  writeRestoreSyncParticipation(driver, true, false);
  const preview = await inspectBackupRestoreSync(backup.destinationPath);
  expect(preview.same).toBe(true);
  await restore(backup.destinationPath, 'backup', 'pause');
  closeDatabaseConnection();
  initializeDatabase();
  expect(loadDesktopSyncGroup()).toMatchObject({ group_id: 'same-group', display_name: 'Current name' });
  expect(openDatabaseConnection().driver.queryOne('SELECT workgroup_key FROM sync_groups WHERE group_id = ?', ['same-group']))
    .toEqual({ workgroup_key: secret });
  expect(openDatabaseConnection().driver.queryOne('SELECT device_name FROM sync_group_devices'))
    .toEqual({ device_name: 'Current device' });
  expect(content()).toBe('backup');
  expect(isDesktopCompanionSyncPaused()).toBe(true);
});
