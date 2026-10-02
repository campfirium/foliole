// @vitest-environment node

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { desktopTaskScheduler } from '../desktopTaskScheduler.js';

let appDataDir = '';
vi.mock('../ipc/paths.js', () => ({
  resolveAppPaths: () => ({
    app_data_dir: appDataDir,
    app_cache_dir: path.join(appDataDir, 'cache'),
    app_config_dir: path.join(appDataDir, 'config'),
    app_log_dir: path.join(appDataDir, 'logs')
  })
}));

import { createApplicationDatabaseBackup, restoreApplicationDatabaseBackup } from './backupRestore.js';
import { inspectBackupRestoreSync } from './backupRestoreSyncPreview.js';
import { closeDatabaseConnection, openDatabaseConnection } from './connection.js';
import { initializeDatabase } from './migrate.js';
import { upsertNodeSnapshot } from './nodeMutations.js';
import { createDesktopSyncGroup, loadDesktopSyncGroup } from './syncGroupStore.js';
import { buildDesktopSyncPackFromDriver } from './syncPackBuilderFromDriver.js';

let root = '';
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-group-restore-'));
  appDataDir = path.join(root, 'app-data');
  initializeDatabase();
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  closeDatabaseConnection();
  await fs.rm(root, { recursive: true, force: true });
});

it('restores an older backup and keeps the current workgroup connection with an applied event', async () => {
  upsertNodeSnapshot({
    anchorLink: null, content: '# Backup topic', createdAt: '2026-09-27T00:00:00.000Z',
    isTitleManual: true, kind: 'topic', nodeId: 'backup-topic', parentNodeId: null,
    position: 0, reveal: null, title: 'Backup topic', updatedAt: '2026-09-27T00:00:00.000Z'
  });
  const backup = await createApplicationDatabaseBackup();
  const identity = createSyncGroupDeviceIdentity({
    device_anchor: '11111111-1111-4111-8111-111111111111',
    group_id: 'group-restore', library_path: '/library/a', path_flavor: 'posix'
  });
  createDesktopSyncGroup({ device: identity, deviceName: 'A', platform: 'desktop',
    workgroupKey: 'current-secret' });
  const before = loadDesktopSyncGroup();
  const currentDriver = openDatabaseConnection().driver;
  currentDriver.execute(`INSERT INTO setting_records
    (key, scope, platform, form_factor, host_name, value_json, content_hash, updated_at)
    VALUES ('host_preference', 'host', 'windows', 'desktop', 'A', 'true', 'hash', 'now')`);
  currentDriver.execute("INSERT INTO settings VALUES ('host_preference', 'true', 'now')");
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-30T00:00:00.000Z'));
  const pause = desktopTaskScheduler.pauseResource.bind(desktopTaskScheduler);
  vi.spyOn(desktopTaskScheduler, 'pauseResource').mockImplementation(async (resource) => {
    const resume = await pause(resource);
    vi.setSystemTime(new Date('2026-09-30T00:01:00.000Z'));
    return resume;
  });
  const preview = await inspectBackupRestoreSync(backup.destinationPath);
  const result = await restoreApplicationDatabaseBackup({ sourcePath: backup.destinationPath,
    choice: { source: 'current', action: 'overwrite', revision: preview.revision } });
  const after = loadDesktopSyncGroup();
  const driver = openDatabaseConnection().driver;
  const event = driver.queryOne<{ restore_id: string; applied_at: string | null }>(
    'SELECT restore_id, applied_at FROM sync_group_restore_events WHERE group_id = ?',
    ['group-restore']
  );
  expect(result.sourcePath).toBe(backup.destinationPath);
  expect(after).toEqual(before);
  expect(driver.queryOne('SELECT restored_at FROM sync_group_restore_events'))
    .toEqual({ restored_at: '2026-09-30T00:00:00.000Z' });
  expect(driver.queryOne("SELECT value FROM settings WHERE key = 'host_preference'"))
    .toEqual({ value: 'true' });
  expect(driver.queryOne("SELECT value_json FROM setting_records WHERE key = 'host_preference'"))
    .toEqual({ value_json: 'true' });
  expect(driver.queryOne<{ id: string }>(
    "SELECT id FROM nodes WHERE id = 'backup-topic'"
  )).toEqual({ id: 'backup-topic' });
  expect(event).toMatchObject({ restore_id: expect.stringMatching(/^restore-/),
    applied_at: expect.any(String) });
  expect(driver.queryOne<{ workgroup_key: string }>(
    'SELECT workgroup_key FROM sync_groups WHERE group_id = ?', ['group-restore']
  )?.workgroup_key).toBe('current-secret');
  const pack = await buildDesktopSyncPackFromDriver({ fromPeerId: identity.identity_key,
    fromStateSeq: 0, outputPath: path.join(root, 'restore.syncpack'),
    packId: 'restore-pack', restoreId: event!.restore_id }, driver);
  expect(pack.objectCount).toBeGreaterThan(0);
  expect(pack.manifest.restore_id).toBe(event!.restore_id);
  expect(driver.queryOne('SELECT source_epoch FROM sync_state_sequence'))
    .toEqual({ source_epoch: event!.restore_id });
});
