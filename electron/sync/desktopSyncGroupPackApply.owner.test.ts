import { beforeEach, expect, it, vi } from 'vitest';

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
    run: vi.fn(async () => assertOwned()),
    manifest: { toStateSeq: 1 } as Record<string, unknown>
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
  extractSyncPackDatabaseFromFile: async () => runtime.manifest
}));
vi.mock('../database/desktopSettingMaterializer.js', () => ({
  materializeDesktopSettingRecord: vi.fn()
}));

import { applyDesktopSyncGroupPack } from './desktopSyncGroupPackApply.js';

beforeEach(() => {
  runtime.manifest = { toStateSeq: 1 };
  vi.clearAllMocks();
});

it('keeps the SQLite owner through incoming pack attachment and apply', async () => {
  await expect(applyDesktopSyncGroupPack({
    after: 0,
    peer: { endpoint_url: 'http://member', group_id: 'group-1',
      local_device_id: 'desktop-a', peer_device_id: 'desktop-b', peer_device_name: 'Windows' }
  }, '/tmp/pack-owner-test/archive.zip', '/tmp/pack-owner-test')).resolves.toEqual({
    cursor: 1,
    event: { appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] },
    participatingArticleIds: []
  });
  expect(runtime.run).toHaveBeenCalledWith(expect.stringContaining('ATTACH DATABASE'));
  expect(runtime.run).toHaveBeenCalledWith('DETACH DATABASE inc');
  expect(runtime.apply).toHaveBeenCalledOnce();
});

it('stages a dependency page without advancing the business cursor', async () => {
  const dependencyProgress = { transfer: { sourceViewId: 'view' }, nextRow: 1,
    digest: 'digest', position: { table: 'node_sync_versions', key: { key: 'v1', ordinal: -1 } } };
  runtime.manifest = { toStateSeq: 0, dependencyPage: { transfer: {}, rowCount: 1 } };
  runtime.apply.mockResolvedValueOnce({ applied: false, appliedTombstoneNodeIds: [],
    appliedReviewOpIds: [], participatingArticleIds: [], dependencyProgress, toStateSeq: 0 } as
    Awaited<ReturnType<typeof runtime.apply>> & { dependencyProgress: typeof dependencyProgress });
  await expect(applyDesktopSyncGroupPack({ after: 0,
    peer: { endpoint_url: 'http://member', group_id: 'group-1', local_device_id: 'desktop-a',
      peer_device_id: 'desktop-b', peer_device_name: 'Windows' }
  }, '/tmp/pack-owner-test/dependency.zip', '/tmp/pack-owner-test')).resolves.toMatchObject({
    cursor: 0, dependencyProgress,
    event: { appliedNodeIds: [], appliedObjectIds: [], appliedReviewOpIds: [] }
  });
});
