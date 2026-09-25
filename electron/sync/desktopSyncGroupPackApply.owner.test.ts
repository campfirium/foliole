import { expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => {
  let owned = false;
  const assertOwned = () => {
    if (!owned) throw new Error('sqlite connection is owned by another asynchronous transaction');
  };
  return {
    assertOwned,
    apply: vi.fn(async () => {
      assertOwned();
      return {
        applied: false, appliedTombstoneNodeIds: [], participatingArticleIds: [],
        appliedReviewOpIds: [], toStateSeq: 1
      };
    }),
    enter: async <T>(execute: () => Promise<T> | T) => {
      owned = true;
      try { return await execute(); } finally { owned = false; }
    },
    run: vi.fn(async () => assertOwned())
  };
});

vi.mock('../database/connection.js', () => ({
  openDatabaseConnection: () => {
    runtime.assertOwned();
    return { sqlite: {} };
  },
  runWithDatabaseConnectionOwner: runtime.enter
}));
vi.mock('../database/betterSqliteDbPort.js', () => ({
  createBetterSqliteDbPort: () => ({ run: runtime.run })
}));
vi.mock('../database/hostProfile.js', () => ({
  loadOrCreateDesktopHostName: () => {
    runtime.assertOwned();
    return 'Mac';
  }
}));
vi.mock('../../lib/core/sync/syncPackManifestValidation.js', () => ({
  assertSyncPackManifestMatchesDatabase: async () => runtime.assertOwned()
}));
vi.mock('../../lib/core/sync/syncPackNodeApplyExecutor.js', () => ({
  applySyncPackNodeSurfaceWithDbPort: runtime.apply
}));
vi.mock('./syncPackContainerReader.js', () => ({
  extractSyncPackDatabase: async () => ({ toStateSeq: 1 })
}));
vi.mock('../database/desktopSettingMaterializer.js', () => ({
  materializeDesktopSettingRecord: vi.fn()
}));
vi.mock('./workspaceSyncAppliedEvents.js', () => ({ notifyWorkspaceSyncApplied: vi.fn() }));

import { applyDesktopSyncGroupPack } from './desktopSyncGroupPackApply.js';

it('keeps the SQLite owner through incoming pack attachment and apply', async () => {
  await expect(applyDesktopSyncGroupPack({
    after: 0,
    peer: { endpoint_url: 'http://member', group_id: 'group-1',
      local_device_id: 'desktop-a', peer_device_id: 'desktop-b', peer_device_name: 'Windows' }
  }, Buffer.from('pack'), '/tmp/pack-owner-test')).resolves.toEqual({
    cursor: 1, participatingArticleIds: []
  });
  expect(runtime.run).toHaveBeenCalledWith(expect.stringContaining('ATTACH DATABASE'));
  expect(runtime.run).toHaveBeenCalledWith('DETACH DATABASE inc');
  expect(runtime.apply).toHaveBeenCalledOnce();
});
