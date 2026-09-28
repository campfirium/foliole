import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyDb: vi.fn(async () => ({ applied: true, to_state_seq: 3,
    applied_group_fact_count: 0, applied_object_count: 1, handled_conflict_count: 0 })),
  applyShared: vi.fn(async () => ({ applied: true, to_state_seq: 3 })),
  createCursorStore: vi.fn(() => ({ loadCursor: vi.fn(),
    loadRestoreCursor: vi.fn(async () => 0), saveCursor: vi.fn() })),
  requireRuntime: vi.fn(() => ({ kind: 'ios-native', platform: 'ios' })),
  runWriter: vi.fn((task: () => Promise<unknown>) => task())
}));

vi.mock('../../../companionRuntimeCapabilities', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../companionRuntimeCapabilities')>(),
  requireAvailableCompanionRuntime: mocks.requireRuntime
}));
vi.mock('../../../companionSyncPackNodes', () => ({
  applyCompanionSyncPackNodesWithDbPort: mocks.applyDb,
  applyCompanionSyncPackPathWithSharedCore: mocks.applyShared
}));
vi.mock('../../../companionSyncWriterQueue', () => ({ runCompanionSyncWriterTask: mocks.runWriter }));
vi.mock('../../runtime/iosCompanionDatabaseBootstrap', () => ({
  getIosCompanionDatabaseOwner: () => ({ runWriter: (task: (db: object) => Promise<unknown>) => task({}) })
}));
vi.mock('../cursor/iosCompanionSyncPackCursorStore', () => ({
  createIosCompanionSyncPackCursorStore: mocks.createCursorStore
}));

describe('iosCompanionSyncPackApply', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes the local pack path through the shared apply core and writer queue', async () => {
    const manager = {};
    const { applyIosCompanionSyncPackPath } = await import('./iosCompanionSyncPackApply');

    await expect(applyIosCompanionSyncPackPath({
      deviceId: 'ios-device', hostName: 'ios-device',
      packPath: '/Library/incoming.db',
      sourcePeerId: 'desktop-device'
    }, manager as never)).resolves.toMatchObject({ applied: true });

    expect(mocks.requireRuntime).toHaveBeenCalledWith('sync-pack-apply');
    expect(mocks.createCursorStore).toHaveBeenCalledWith(manager, 'desktop-device');
    expect(mocks.applyShared).toHaveBeenCalledWith(
      { deviceId: 'ios-device', hostName: 'ios-device', packPath: '/Library/incoming.db', sourcePeerId: 'desktop-device' },
      mocks.createCursorStore.mock.results[0]?.value,
      manager
    );
  });

  it('does not expose the ios apply entry to web preview', async () => {
    mocks.requireRuntime.mockReturnValueOnce({ kind: 'web-preview', platform: 'web' });
    const { applyIosCompanionSyncPackPath } = await import('./iosCompanionSyncPackApply');

    await expect(applyIosCompanionSyncPackPath({
      deviceId: 'web', hostName: 'web', packPath: '/tmp/pack.db', sourcePeerId: 'desktop-device'
    }, {} as never))
      .rejects.toMatchObject({ capability: 'sync-pack-apply', platform: 'web' });
    expect(mocks.applyShared).not.toHaveBeenCalled();
  });

  it('passes the restore ID to the active iOS database apply path', async () => {
    const { applyIosCompanionSyncPackPath } = await import('./iosCompanionSyncPackApply');
    await applyIosCompanionSyncPackPath({
      deviceId: 'ios-device', expectedRestoreId: 'restore-2', hostName: 'ios-device',
      packPath: '/Library/incoming.db', sourcePeerId: 'desktop-device'
    });
    expect(mocks.applyDb).toHaveBeenCalledWith(expect.objectContaining({
      currentCursor: 0, expectedRestoreId: 'restore-2'
    }), expect.any(Object));
  });
});
