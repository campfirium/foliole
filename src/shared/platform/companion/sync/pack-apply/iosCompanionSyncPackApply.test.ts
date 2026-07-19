import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  applyShared: vi.fn(async () => ({ applied: true, to_state_seq: 3 })),
  createCursorStore: vi.fn(() => ({ loadCursor: vi.fn(), saveCursor: vi.fn() })),
  requireRuntime: vi.fn(() => ({ kind: 'ios-native', platform: 'ios' })),
  runWriter: vi.fn((task: () => Promise<unknown>) => task())
}));

vi.mock('../../../companionRuntimeCapabilities', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../../companionRuntimeCapabilities')>(),
  requireAvailableCompanionRuntime: mocks.requireRuntime
}));
vi.mock('../../../companionSyncPackNodes', () => ({ applyCompanionSyncPackPathWithSharedCore: mocks.applyShared }));
vi.mock('../../../companionSyncWriterQueue', () => ({ runCompanionSyncWriterTask: mocks.runWriter }));
vi.mock('../cursor/iosCompanionSyncPackCursorStore', () => ({
  createIosCompanionSyncPackCursorStore: mocks.createCursorStore
}));

describe('iosCompanionSyncPackApply', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes the local pack path through the shared apply core and writer queue', async () => {
    const manager = {};
    const { applyIosCompanionSyncPackPath } = await import('./iosCompanionSyncPackApply');

    await expect(applyIosCompanionSyncPackPath({
      deviceId: 'ios-device',
      packPath: '/Library/incoming.db'
    }, manager as never)).resolves.toMatchObject({ applied: true });

    expect(mocks.requireRuntime).toHaveBeenCalledWith('sync-pack-apply');
    expect(mocks.createCursorStore).toHaveBeenCalledWith(manager);
    expect(mocks.applyShared).toHaveBeenCalledWith(
      { deviceId: 'ios-device', packPath: '/Library/incoming.db' },
      mocks.createCursorStore.mock.results[0]?.value,
      manager
    );
  });

  it('does not expose the ios apply entry to web preview', async () => {
    mocks.requireRuntime.mockReturnValueOnce({ kind: 'web-preview', platform: 'web' });
    const { applyIosCompanionSyncPackPath } = await import('./iosCompanionSyncPackApply');

    await expect(applyIosCompanionSyncPackPath({ deviceId: 'web', packPath: '/tmp/pack.db' }, {} as never))
      .rejects.toMatchObject({ capability: 'sync-pack-apply', platform: 'web' });
    expect(mocks.applyShared).not.toHaveBeenCalled();
  });
});
