// @vitest-environment node
import { expect, it } from 'vitest';

import { readRequestSyncInventorySnapshot } from '../../lib/core/sync/framedSyncInventoryRead.js';
import { beginSyncGroupLocalAdoption, loadSyncGroupLocalAdoption } from '../../lib/core/sync/syncGroupLocalAdoption.js';
import { loadSyncGroupOverwriteProgress, prepareSyncGroupOverwrite } from '../../lib/core/sync/syncGroupOverwriteProgress.js';

import { ids, originals, restoreFixture, round } from './requestSyncRestoreRecovery.testSupport.js';

it.each(['empty', 'finish-failure'] as const)('completes current request adoption after %s', async mode => {
  const fixture = await restoreFixture();
  const source = fixture.peer('source'); const target = fixture.peer('target');
  const adoption = { groupId: 'group', libraryEpoch: 'adoption-epoch', providerDeviceId: 'source',
    providerDeviceName: 'Source', providerPlatform: 'mac', endpointUrl: 'http://localhost:1' };
  const progress = { groupId: 'group', overwriteId: adoption.libraryEpoch, providerDeviceId: source.id,
    providerLibraryEpoch: source.epoch, receiverDeviceId: target.id, receiverLibraryEpoch: adoption.libraryEpoch };
  try {
    if (mode === 'finish-failure') { await source.seed('first'); await source.seed('second'); }
    await target.seed('obsolete');
    await beginSyncGroupLocalAdoption(target.db, adoption);
    await prepareSyncGroupOverwrite(target.db, progress);
    if (mode === 'finish-failure') {
      target.sqlite.exec(`CREATE TRIGGER fail_adoption BEFORE INSERT ON sync_group_metadata
        WHEN NEW.key = 'sync_group_completed_adoption' BEGIN SELECT RAISE(ABORT, 'identity_finish_failure'); END`);
      await expect(round(source, target, progress)).rejects.toThrow('identity_finish_failure');
      expect(ids(target)).toEqual([{ id: 'first' }, { id: 'second' }]);
      const accepted = originals(target);
      expect(await readRequestSyncInventorySnapshot(target.db)).toEqual([]);
      expect(await loadSyncGroupLocalAdoption(target.db)).not.toBeNull();
      expect(await loadSyncGroupOverwriteProgress(target.db)).toEqual(progress);
      target.reopen();
      expect(originals(target)).toEqual(accepted);
      expect((await prepareSyncGroupOverwrite(target.db, progress)).cleared).toBe(false);
      target.sqlite.exec('DROP TRIGGER fail_adoption');
    }
    expect((await round(source, target, progress)).complete).toBe(true);
    expect(await loadSyncGroupLocalAdoption(target.db)).toBeNull();
    expect(await loadSyncGroupOverwriteProgress(target.db)).toBeNull();
    expect(ids(target)).toEqual(ids(source));
    expect(JSON.parse(String(target.sqlite.prepare("SELECT value FROM sync_group_metadata WHERE key = 'sync_group_completed_adoption'").pluck().get())))
      .toEqual(adoption);
    target.reopen();
    expect(await loadSyncGroupLocalAdoption(target.db)).toBeNull();
    expect(ids(target)).toEqual(ids(source));
  } finally { await fixture.close(); }
});
