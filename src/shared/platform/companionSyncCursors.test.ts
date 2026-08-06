import { beforeEach, expect, it, vi } from 'vitest';

const writerQueueMock = vi.hoisted(() => ({
  run: vi.fn(async <T>(task: () => Promise<T>) => task())
}));
const iosCursorStoreMock = vi.hoisted(() => ({
  loadCursor: vi.fn(async () => 9),
  saveCursor: vi.fn(async (cursor: number | null) => cursor)
}));
const sharedCursorMock = vi.hoisted(() => ({
  loadChange: vi.fn(async () => null),
  loadNumber: vi.fn(async (kind: string) => kind === 'state' ? 2 : null),
  saveChange: vi.fn(async (_kind: string, cursor) => cursor),
  saveNumber: vi.fn(async (_kind: string, cursor) => cursor)
}));
const iosSyncbackStoreMock = vi.hoisted(() => ({
  loadNodeVersions: vi.fn(async () => [{ object_id: 'ios-created-node', version_id: 'ios-device#1' }]),
  loadNodeVersionPushCursor: vi.fn(async () => null),
  loadReviewLog: vi.fn(async () => [{ op_id: 'ios-op-1' }]),
  loadReviewLogPushCursor: vi.fn(async () => null),
  loadStateChanges: vi.fn(async () => [{ object_id: 'ios-node-1', object_type: 'node_review', state_seq: 7 }]),
  loadStatePushCursor: vi.fn(async () => 6),
  saveNodeVersionPushCursor: vi.fn(async (cursor) => cursor),
  saveReviewLogPushCursor: vi.fn(async (cursor) => cursor),
  saveStatePushCursor: vi.fn(async (cursor) => cursor)
}));

vi.mock('./companionSyncWriterQueue', () => ({
  runCompanionSyncWriterTask: writerQueueMock.run
}));
vi.mock('./companion/sync/cursor/iosCompanionSyncPackCursorStore', () => ({
  createIosCompanionSyncPackCursorStore: vi.fn(() => iosCursorStoreMock)
}));
vi.mock('./companion/runtime/iosCompanionSyncCursorStore', () => ({
  loadIosCompanionChangeCursor: sharedCursorMock.loadChange,
  loadIosCompanionNumberCursor: sharedCursorMock.loadNumber,
  saveIosCompanionChangeCursor: sharedCursorMock.saveChange,
  saveIosCompanionNumberCursor: sharedCursorMock.saveNumber
}));
vi.mock('./companion/sync/syncback/iosCompanionSyncbackStore', () => ({
  getIosCompanionSyncbackStore: vi.fn(() => iosSyncbackStoreMock)
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
  await expect(api.loadCompanionSyncPackCursor()).resolves.toBe(9);
  await expect(api.loadCompanionSyncStatePushCursor()).resolves.toBe(6);
  await expect(api.loadCompanionSyncNodeVersionCursor()).resolves.toBeNull();
  await expect(api.loadCompanionSyncReviewLogCursor()).resolves.toBeNull();
  await expect(api.saveCompanionSyncStateCursor(3)).resolves.toBe(3);
  await expect(api.saveCompanionSyncPackCursor(5)).resolves.toBe(5);
  await expect(api.saveCompanionSyncNodeVersionCursor(cursor)).resolves.toEqual(cursor);
  await expect(api.saveCompanionSyncReviewLogPushCursor(cursor)).resolves.toEqual(cursor);
  await expect(api.loadCompanionSyncStateChanges(null)).resolves.toEqual([
    { object_id: 'ios-node-1', object_type: 'node_review', state_seq: 7 }
  ]);
  await expect(api.loadCompanionPendingSyncSummary()).resolves.toEqual({ pendingCount: 3 });
  expect(writerQueueMock.run).toHaveBeenCalledTimes(2);
});

it('routes iOS syncback cursors and rows through the SQLite store', async () => {
  capacitorMock.platform.mockReturnValue('ios');
  const getItem = vi.spyOn(Storage.prototype, 'getItem');
  const api = await import('./companionSyncCursors');

  await expect(api.loadCompanionSyncStateCursor()).resolves.toBe(2);
  await expect(api.loadCompanionSyncStatePushCursor()).resolves.toBe(6);
  await expect(api.loadCompanionSyncStateChanges(null)).resolves.toEqual([
    { object_id: 'ios-node-1', object_type: 'node_review', state_seq: 7 }
  ]);
  await expect(api.loadCompanionSyncReviewLog(null)).resolves.toEqual([{ op_id: 'ios-op-1' }]);
  await expect(api.loadCompanionSyncNodeVersions(null)).resolves.toEqual([
    { object_id: 'ios-created-node', version_id: 'ios-device#1' }
  ]);
  await expect(api.saveCompanionSyncStatePushCursor(7)).resolves.toBe(7);
  await expect(api.saveCompanionSyncNodeVersionPushCursor({
    change_id: 'ios-device#1', created_at: '2026-07-21T00:00:00.000Z'
  })).resolves.toEqual({ change_id: 'ios-device#1', created_at: '2026-07-21T00:00:00.000Z' });
  await expect(api.loadCompanionPendingSyncSummary()).resolves.toEqual({ pendingCount: 3 });
  expect(getItem).not.toHaveBeenCalled();
  expect(sharedCursorMock.loadNumber).toHaveBeenCalledWith('state');
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
