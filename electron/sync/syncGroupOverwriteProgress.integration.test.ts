// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';

import { assertSyncGroupLocalPublicationAllowed, finishSyncGroupLocalAdoption,
  loadSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { assertSyncGroupOverwriteInbound, finishSyncGroupOverwriteProgress,
  loadSyncGroupOverwriteProgress, prepareSyncGroupOverwrite } from '../../lib/core/sync/syncGroupOverwriteProgress.js';

import { adoption, context, overwriteBusinessState, overwriteFixture,
  progress } from './syncGroupOverwriteProgress.testSupport.js';

const fixtures: Awaited<ReturnType<typeof overwriteFixture>>[] = [];
afterEach(() => { for (const fixture of fixtures.splice(0)) fixture.host.close(); });
async function fixture(mode: 'adoption' | 'restore' = 'adoption') {
  const value = await overwriteFixture(mode);
  fixtures.push(value);
  return value;
}

describe('durable clear-once overwrite progress on actual SQLite', () => {
  it('rolls back the old library reset when inserting the progress marker fails', async () => {
    const { host } = await fixture();
    const before = overwriteBusinessState(host);
    host.main.exec(`CREATE TRIGGER reject_overwrite_marker BEFORE INSERT ON sync_group_metadata
      WHEN NEW.key = 'sync_group_overwrite_progress' BEGIN SELECT RAISE(ABORT, 'marker_rejected'); END`);
    await expect(prepareSyncGroupOverwrite(host.port(), progress)).rejects.toThrow('marker_rejected');
    expect(overwriteBusinessState(host)).toEqual(before);
    expect(await loadSyncGroupOverwriteProgress(host.port())).toBeNull();
    host.main.exec('DROP TRIGGER reject_overwrite_marker');
    expect(await prepareSyncGroupOverwrite(host.port(), progress))
      .toEqual({ cleared: true, removedNodeIds: ['node-1'] });
    expect(host.main.prepare("SELECT id FROM nodes WHERE id = 'node-1'").get()).toBeUndefined();
    expect(await loadSyncGroupOverwriteProgress(host.port())).toEqual(progress);
  });
});

describe('pending overwrite identity on actual SQLite', () => {
  it('keeps a supplemented unit and the original marker through repeat prepare and reopen', async () => {
    const { host, supplement } = await fixture();
    await prepareSyncGroupOverwrite(host.port(), progress);
    await supplement();
    const before = overwriteBusinessState(host);
    expect(host.main.prepare("SELECT id FROM nodes WHERE id = 'node-1'").get()).toEqual({ id: 'node-1' });
    host.reopen();
    expect(await prepareSyncGroupOverwrite(host.port(), progress))
      .toEqual({ cleared: false, removedNodeIds: [] });
    expect(overwriteBusinessState(host)).toEqual(before);
    expect(await assertSyncGroupOverwriteInbound(host.port(), context)).toBe(true);
  });

  it('rejects changed source epochs and devices without changing durable progress', async () => {
    const { host } = await fixture();
    await prepareSyncGroupOverwrite(host.port(), progress);
    const before = overwriteBusinessState(host);
    await expect(prepareSyncGroupOverwrite(host.port(), { ...progress, providerLibraryEpoch: 'other-epoch' }))
      .rejects.toThrow('sync_group_overwrite_source_changed');
    await expect(prepareSyncGroupOverwrite(host.port(), { ...progress, providerDeviceId: 'other-device' }))
      .rejects.toThrow('sync_group_local_adoption_source_mismatch');
    expect(overwriteBusinessState(host)).toEqual(before);
    expect(await loadSyncGroupOverwriteProgress(host.port())).toEqual(progress);
  });
});

describe('overwrite publication and completion on actual SQLite', () => {
  it('rejects every mismatched inbound identity while preserving the pending owner', async () => {
    const { host } = await fixture();
    expect(await assertSyncGroupOverwriteInbound(host.port(), context)).toBe(false);
    await prepareSyncGroupOverwrite(host.port(), progress);
    const before = overwriteBusinessState(host);
    for (const key of ['groupId', 'senderDeviceId', 'senderLibraryEpoch', 'receiverDeviceId', 'receiverLibraryEpoch']) {
      await expect(assertSyncGroupOverwriteInbound(host.port(), { ...context, [key]: 'wrong' }))
        .rejects.toThrow('sync_group_overwrite_source_changed');
    }
    expect(overwriteBusinessState(host)).toEqual(before);
    expect(await loadSyncGroupLocalAdoption(host.port())).toEqual(adoption);
  });

  it('blocks publication during pending restore and after the clear-once marker is committed', async () => {
    const { host } = await fixture('restore');
    await expect(assertSyncGroupLocalPublicationAllowed(host.port())).rejects.toThrow('sync_group_restore_pending');
    await prepareSyncGroupOverwrite(host.port(), progress);
    const before = overwriteBusinessState(host);
    await expect(assertSyncGroupLocalPublicationAllowed(host.port())).rejects.toThrow('sync_group_overwrite_pending');
    expect(overwriteBusinessState(host)).toEqual(before);
  });

  it('rolls back marker removal if identity completion fails in the same transaction', async () => {
    const { host } = await fixture();
    await prepareSyncGroupOverwrite(host.port(), progress);
    const before = overwriteBusinessState(host);
    host.main.exec(`CREATE TRIGGER reject_adoption_finish BEFORE INSERT ON sync_group_metadata
      WHEN NEW.key = 'sync_group_completed_adoption' BEGIN SELECT RAISE(ABORT, 'identity_finish_rejected'); END`);
    const finish = () => host.port().transaction(async (tx) => {
      await finishSyncGroupOverwriteProgress(tx, progress);
      await finishSyncGroupLocalAdoption(tx, adoption);
    });
    await expect(finish()).rejects.toThrow('identity_finish_rejected');
    expect(overwriteBusinessState(host)).toEqual(before);
    expect(await loadSyncGroupOverwriteProgress(host.port())).toEqual(progress);
    expect(await loadSyncGroupLocalAdoption(host.port())).toEqual(adoption);
    host.main.exec('DROP TRIGGER reject_adoption_finish');
    await finish();
    expect(await loadSyncGroupOverwriteProgress(host.port())).toBeNull();
    expect(await loadSyncGroupLocalAdoption(host.port())).toBeNull();
    await expect(assertSyncGroupLocalPublicationAllowed(host.port())).resolves.toBeUndefined();
  });
});
