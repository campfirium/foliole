import { beforeEach, expect, it, vi } from 'vitest';

const writerQueueMock = vi.hoisted(() => ({
  run: vi.fn(async <T>(task: () => Promise<T>) => task())
}));
const iosCursorStoreMock = vi.hoisted(() => ({
  loadCursor: vi.fn(async () => 9),
  saveCursor: vi.fn(async (cursor: number | null) => cursor)
}));

vi.mock('./companionSyncWriterQueue', () => ({
  runCompanionSyncWriterTask: writerQueueMock.run
}));
vi.mock('./companion/sync/cursor/iosCompanionSyncPackCursorStore', () => ({
  createIosCompanionSyncPackCursorStore: vi.fn(() => iosCursorStoreMock)
}));

const capacitorMock = vi.hoisted(() => ({
  isNative: vi.fn(() => true),
  platform: vi.fn(() => 'android'),
  plugin: {
    loadSyncNodeVersionCursor: vi.fn(async () => ({ cursor: null })),
    loadSyncNodeVersionPushCursor: vi.fn(async () => ({ cursor: null })),
    loadSyncNodeVersions: vi.fn(async () => ({ nodes: [{ object_id: 'node-1' }] })),
    loadSyncPackCursor: vi.fn(async () => ({ cursor: 4 })),
    loadSyncReviewLog: vi.fn(async () => ({ reviews: [{ op_id: 'op-1' }] })),
    loadSyncReviewLogCursor: vi.fn(async () => ({ cursor: null })),
    loadSyncReviewLogPushCursor: vi.fn(async () => ({ cursor: null })),
    loadSyncStateChanges: vi.fn(async () => ({ objects: [{ object_id: 'one', object_type: 'setting', state_seq: 1 }] })),
    loadSyncStateCursor: vi.fn(async () => ({ cursor: 2 })),
    loadSyncStatePushCursor: vi.fn(async () => ({ cursor: null })),
    saveSyncNodeVersionCursor: vi.fn(async ({ cursor }) => ({ cursor })),
    saveSyncNodeVersionPushCursor: vi.fn(async ({ cursor }) => ({ cursor })),
    saveSyncPackCursor: vi.fn(async ({ cursor }) => ({ cursor })),
    saveSyncReviewLogCursor: vi.fn(async ({ cursor }) => ({ cursor })),
    saveSyncReviewLogPushCursor: vi.fn(async ({ cursor }) => ({ cursor })),
    saveSyncStateCursor: vi.fn(async ({ cursor }) => ({ cursor })),
    saveSyncStatePushCursor: vi.fn(async ({ cursor }) => ({ cursor }))
  }
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: capacitorMock.platform,
    isNativePlatform: capacitorMock.isNative
  },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
}));

beforeEach(() => {
  vi.clearAllMocks();
  writerQueueMock.run.mockImplementation(async <T>(task: () => Promise<T>) => task());
  capacitorMock.isNative.mockReturnValue(true);
  capacitorMock.platform.mockReturnValue('android');
});

it('bridges native sync cursors and pending summary', async () => {
  const api = await import('./companionSyncCursors');
  const cursor = { change_id: 'change-2', created_at: '2026-04-25T00:01:00.000Z' };

  await expect(api.loadCompanionSyncStateCursor()).resolves.toBe(2);
  await expect(api.loadCompanionSyncPackCursor()).resolves.toBe(4);
  await expect(api.loadCompanionSyncStatePushCursor()).resolves.toBeNull();
  await expect(api.loadCompanionSyncNodeVersionCursor()).resolves.toBeNull();
  await expect(api.loadCompanionSyncReviewLogCursor()).resolves.toBeNull();
  await expect(api.saveCompanionSyncStateCursor(3)).resolves.toBe(3);
  await expect(api.saveCompanionSyncPackCursor(5)).resolves.toBe(5);
  await expect(api.saveCompanionSyncNodeVersionCursor(cursor)).resolves.toEqual(cursor);
  await expect(api.saveCompanionSyncReviewLogPushCursor(cursor)).resolves.toEqual(cursor);
  await expect(api.loadCompanionSyncStateChanges(null)).resolves.toEqual([
    { object_id: 'one', object_type: 'setting', state_seq: 1 }
  ]);
  await expect(api.loadCompanionPendingSyncSummary()).resolves.toEqual({ pendingCount: 3 });
  expect(writerQueueMock.run).toHaveBeenCalledTimes(4);
});

it('rejects ios before reading web cursors or returning empty changes', async () => {
  capacitorMock.platform.mockReturnValue('ios');
  const getItem = vi.spyOn(Storage.prototype, 'getItem');
  const api = await import('./companionSyncCursors');

  await expect(api.loadCompanionSyncStateCursor()).rejects.toMatchObject({
    code: 'NATIVE_COMPANION_CAPABILITY_UNAVAILABLE',
    platform: 'ios'
  });
  await expect(api.loadCompanionSyncStateChanges(null)).rejects.toMatchObject({
    code: 'NATIVE_COMPANION_CAPABILITY_UNAVAILABLE',
    platform: 'ios'
  });
  expect(getItem).not.toHaveBeenCalled();
  expect(capacitorMock.plugin.loadSyncStateChanges).not.toHaveBeenCalled();
});

it('persists the iOS sync-pack cursor through the SQLite store', async () => {
  capacitorMock.platform.mockReturnValue('ios');
  const getItem = vi.spyOn(Storage.prototype, 'getItem');
  const api = await import('./companionSyncCursors');

  await expect(api.loadCompanionSyncPackCursor()).resolves.toBe(9);
  await expect(api.saveCompanionSyncPackCursor(12)).resolves.toBe(12);

  expect(iosCursorStoreMock.loadCursor).toHaveBeenCalledTimes(1);
  expect(iosCursorStoreMock.saveCursor).toHaveBeenCalledWith(12);
  expect(writerQueueMock.run).toHaveBeenCalledTimes(1);
  expect(getItem).not.toHaveBeenCalled();
  expect(capacitorMock.plugin.loadSyncPackCursor).not.toHaveBeenCalled();
});
