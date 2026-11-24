// @vitest-environment node
import { expect, it, vi } from 'vitest';

import { assertSyncGroupLocalPublicationAllowed, finishSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { assertSyncGroupOverwriteInbound, finishSyncGroupOverwriteProgress,
  loadSyncGroupOverwriteProgress, prepareSyncGroupOverwrite } from '../../lib/core/sync/syncGroupOverwriteProgress.js';
import { markSyncGroupRestoreApplied } from '../../lib/core/sync/syncGroupRestoreEvents.js';
import { createSyncGroupDeviceIdentity } from '../../lib/platform/syncGroupUnifiedContract.js';
import { loadDesktopLibraryWriterBinding } from '../deviceAnchorStore.js';
import { adoption, context, overwriteFixture, progress } from '../sync/syncGroupOverwriteProgress.testSupport.js';

import { createBetterSqlite3Driver } from './betterSqlite3Driver.js';
import { rebindStartupMemberIdentity } from './startupMemberIdentity.js';

vi.mock('./connection.js', () => ({}));

const now = '2026-11-24T00:00:00.000Z';

it.each(['adoption', 'restore'] as const)('resumes a partially received %s after moving the library', async (mode) => {
  const { host, supplement } = await overwriteFixture(mode);
  vi.stubEnv('FOLIOLE_ELECTRON_TEST_STATE_ROOT', host.root);
  try {
    const previousDeviceId = joinReceiver(host);
    const original = { ...progress, receiverDeviceId: previousDeviceId };
    expect((await prepareSyncGroupOverwrite(host.port(), original)).cleared).toBe(true);
    await supplement();
    const partial = host.main.prepare('SELECT id, current_version_id FROM nodes ORDER BY id').all();
    expect(partial).toHaveLength(1);

    host.move();
    const driver = createBetterSqlite3Driver(host.main);
    const rebound = rebindStartupMemberIdentity(driver, host.main.name, now)!;
    expect(rebound.previousDeviceId).toBe(previousDeviceId);
    expect(rebound.deviceId).not.toBe(previousDeviceId);
    const resumed = { ...original, receiverDeviceId: rebound.deviceId };
    await expect(prepareSyncGroupOverwrite(host.port(), resumed)).resolves.toEqual({ cleared: false, removedNodeIds: [] });
    expect(host.main.prepare('SELECT id, current_version_id FROM nodes ORDER BY id').all()).toEqual(partial);
    expect(await loadSyncGroupOverwriteProgress(host.port())).toEqual(resumed);
    expect(await assertSyncGroupOverwriteInbound(host.port(), { ...context, receiverDeviceId: rebound.deviceId })).toBe(true);
    expect(driver.queryOne('SELECT library_epoch FROM node_version_local_proof_state'))
      .toEqual({ library_epoch: progress.receiverLibraryEpoch });
    await expect(assertSyncGroupLocalPublicationAllowed(host.port())).rejects.toThrow('pending');

    await host.port().transaction(async tx => {
      await finishSyncGroupOverwriteProgress(tx, resumed);
      if (mode === 'adoption') await finishSyncGroupLocalAdoption(tx, adoption);
      else await markSyncGroupRestoreApplied(tx, { group_id: progress.groupId, restore_id: progress.overwriteId,
        source_device_identity_key: progress.providerDeviceId, restored_at: '2026-10-05T01:00:00.000Z' });
    });
    host.reopen();
    await expect(assertSyncGroupLocalPublicationAllowed(host.port())).resolves.toBeUndefined();
    expect(host.main.prepare('SELECT id, current_version_id FROM nodes ORDER BY id').all()).toEqual(partial);
  } finally {
    vi.unstubAllEnvs();
    host.close();
  }
});

function joinReceiver(host: Awaited<ReturnType<typeof overwriteFixture>>['host']) {
  const binding = loadDesktopLibraryWriterBinding(host.main.name);
  const device = createSyncGroupDeviceIdentity({ group_id: progress.groupId,
    device_anchor: binding.deviceAnchor, library_path: binding.libraryPath,
    path_flavor: process.platform === 'win32' ? 'windows' : 'posix' });
  const driver = createBetterSqlite3Driver(host.main);
  driver.execute('INSERT OR IGNORE INTO sync_groups VALUES (?, ?, ?, ?, ?)', [progress.groupId, 'Group', 'key', now, now]);
  driver.execute(`INSERT INTO sync_group_devices (group_id, device_identity_key, device_anchor, canonical_library_path,
    device_name, platform, state, joined_at, updated_at) VALUES (?, ?, ?, ?, 'Receiver', ?, 'active', ?, ?)`,
  [device.group_id, device.identity_key, device.device_anchor, device.canonical_library_path, process.platform, now, now]);
  driver.execute('INSERT INTO sync_group_local_state VALUES (1, ?, ?, ?, ?)', [device.group_id, device.identity_key, 'active', now]);
  return device.identity_key;
}
