import { beforeEach, describe, expect, it, vi } from 'vitest';

const capacitorMock = vi.hoisted(() => ({
  isNative: vi.fn(() => true),
  platform: vi.fn(() => 'android'),
  plugin: {
    applySyncObjects: vi.fn(async () => ({ applied_object_ids: ['setting:one'] })),
    loadSyncChanges: vi.fn(async () => ({ changes: [{ change_id: 'change-1', created_at: '2026-04-25T00:00:00.000Z' }] })),
    loadSyncChangeCursor: vi.fn(async () => ({ cursor: { change_id: 'change-1', created_at: '2026-04-25T00:00:00.000Z' } })),
    loadSyncIndex: vi.fn(async () => ({ entries: [{ object_id: 'one', object_type: 'setting' }] })),
    loadSyncObjects: vi.fn(async () => ({ objects: [{ object_id: 'one', object_type: 'setting' }] })),
    loadSyncPushCursor: vi.fn(async () => ({ cursor: null })),
    saveSyncActiveViewState: vi.fn(async () => ({ content_hash: 'hash-active', object_id: 'active' })),
    saveSyncNodeReadingRecord: vi.fn(async () => ({ content_hash: 'hash-reading', object_id: 'node-1' })),
    saveSyncNodeReviewRecord: vi.fn(async () => ({ content_hash: 'hash-review', object_id: 'node-1' })),
    saveSyncNodeViewState: vi.fn(async () => ({ content_hash: 'hash-view', object_id: 'view' })),
    saveSyncChangeCursor: vi.fn(async ({ cursor }) => ({ cursor })),
    saveSyncPushCursor: vi.fn(async ({ cursor }) => ({ cursor })),
    saveSyncSettingRecord: vi.fn(async () => ({ content_hash: 'hash-setting', object_id: 'setting-1' }))
  }
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: capacitorMock.platform,
    isNativePlatform: capacitorMock.isNative
  },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
}));

function expectNativePluginCalls(cursor: { change_id: string; created_at: string }) {
  expect(capacitorMock.plugin.loadSyncObjects).toHaveBeenCalledWith({
    object_ids: ['one'],
    object_types: ['setting']
  });
  expect(capacitorMock.plugin.saveSyncChangeCursor).toHaveBeenCalledWith({ cursor });
  expect(capacitorMock.plugin.saveSyncPushCursor).toHaveBeenCalledWith({ cursor });
}

function createReadingProfile() {
  return {
    intervalDurationMs: 1,
    intervalGrowthFactor: 1,
    lastHandledAt: '2026-04-25T00:00:00.000Z',
    nextAt: '2026-04-25T00:01:00.000Z',
    priority: 0,
    readingPosition: 0,
    repetitionCount: 1,
    state: 'active' as const
  };
}

function createReviewProfile() {
  return {
    difficulty: 1,
    due: '2026-04-25T00:00:00.000Z',
    elapsedDays: 0,
    lapses: 0,
    lastReviewAt: null,
    reps: 1,
    scheduledDays: 0,
    stability: 1,
    state: 1 as const
  };
}

async function testNativePluginBridge() {
  const {
    applyCompanionSyncObjects,
    loadCompanionSyncChanges,
    loadCompanionSyncChangeCursor,
    loadCompanionSyncIndex,
    loadCompanionSyncObjects,
    loadCompanionSyncPushCursor,
    saveCompanionSyncActiveViewState,
    saveCompanionSyncNodeReadingRecord,
    saveCompanionSyncNodeReviewRecord,
    saveCompanionSyncNodeViewState,
    saveCompanionSyncChangeCursor,
    saveCompanionSyncPushCursor,
    saveCompanionSyncSettingRecord
  } = await import('./companionSyncObjects');

  const cursor = { change_id: 'change-2', created_at: '2026-04-25T00:01:00.000Z' };
  await expect(loadCompanionSyncIndex()).resolves.toEqual([{ object_id: 'one', object_type: 'setting' }]);
  await expect(loadCompanionSyncObjects(['one'], ['setting'])).resolves.toEqual([{ object_id: 'one', object_type: 'setting' }]);
  await expect(loadCompanionSyncChangeCursor()).resolves.toEqual({ change_id: 'change-1', created_at: '2026-04-25T00:00:00.000Z' });
  await expect(loadCompanionSyncPushCursor()).resolves.toBeNull();
  await expect(loadCompanionSyncChanges(null)).resolves.toEqual([{ change_id: 'change-1', created_at: '2026-04-25T00:00:00.000Z' }]);
  await expect(saveCompanionSyncChangeCursor(cursor)).resolves.toEqual(cursor);
  await expect(saveCompanionSyncPushCursor(cursor)).resolves.toEqual(cursor);
  await expect(saveCompanionSyncSettingRecord({ key: 'one', valueJson: '{}' }))
    .resolves.toEqual({ content_hash: 'hash-setting', object_id: 'setting-1' });
  await expect(saveCompanionSyncActiveViewState('node-1'))
    .resolves.toEqual({ content_hash: 'hash-active', object_id: 'active' });
  await expect(saveCompanionSyncNodeReadingRecord({
    nodeId: 'node-1',
    reading: createReadingProfile()
  })).resolves.toEqual({ content_hash: 'hash-reading', object_id: 'node-1' });
  await expect(saveCompanionSyncNodeReviewRecord({
    nodeId: 'node-1',
    review: createReviewProfile()
  })).resolves.toEqual({ content_hash: 'hash-review', object_id: 'node-1' });
  await expect(saveCompanionSyncNodeViewState({ nodeId: 'node-1', scrollTop: 42.8 }))
    .resolves.toEqual({ content_hash: 'hash-view', object_id: 'view' });
  await expect(applyCompanionSyncObjects([{
    content_hash: 'hash',
    deleted_at: null,
    object_id: 'one',
    object_type: 'setting',
    payload_json: '{}',
    updated_at: '2026-04-25T00:00:00.000Z'
  }])).resolves.toEqual(['setting:one']);

  expectNativePluginCalls(cursor);
}

async function testWebFallbackBridge() {
  capacitorMock.isNative.mockReturnValue(false);
  const {
    applyCompanionSyncObjects,
    loadCompanionSyncChanges,
    loadCompanionSyncChangeCursor,
    loadCompanionSyncIndex,
    loadCompanionSyncObjects,
    loadCompanionSyncPushCursor,
    saveCompanionSyncActiveViewState,
    saveCompanionSyncNodeReadingRecord,
    saveCompanionSyncNodeReviewRecord,
    saveCompanionSyncNodeViewState,
    saveCompanionSyncChangeCursor,
    saveCompanionSyncPushCursor,
    saveCompanionSyncSettingRecord
  } = await import('./companionSyncObjects');

  await expect(loadCompanionSyncIndex()).resolves.toEqual([]);
  await expect(loadCompanionSyncObjects(['one'], ['setting'])).resolves.toEqual([]);
  await expect(loadCompanionSyncChanges(null)).resolves.toEqual([]);
  await expect(loadCompanionSyncChangeCursor()).resolves.toBeNull();
  await expect(loadCompanionSyncPushCursor()).resolves.toBeNull();
  await expect(saveCompanionSyncChangeCursor({ change_id: 'one', created_at: '2026-04-25T00:00:00.000Z' }))
    .resolves.toEqual({ change_id: 'one', created_at: '2026-04-25T00:00:00.000Z' });
  await expect(saveCompanionSyncPushCursor({ change_id: 'one', created_at: '2026-04-25T00:00:00.000Z' }))
    .resolves.toEqual({ change_id: 'one', created_at: '2026-04-25T00:00:00.000Z' });
  await expect(saveCompanionSyncSettingRecord({ key: 'one', valueJson: '{}' })).resolves.toBeNull();
  await expect(saveCompanionSyncActiveViewState('node-1')).resolves.toBeNull();
  await expect(saveCompanionSyncNodeReadingRecord({
    nodeId: 'node-1',
    reading: createReadingProfile()
  })).resolves.toBeNull();
  await expect(saveCompanionSyncNodeReviewRecord({
    nodeId: 'node-1',
    review: createReviewProfile()
  })).resolves.toBeNull();
  await expect(saveCompanionSyncNodeViewState({ nodeId: 'node-1', scrollTop: 42 })).resolves.toBeNull();
  await expect(applyCompanionSyncObjects([])).resolves.toEqual([]);
}

describe('companion sync objects bridge', () => {
  beforeEach(() => {
    capacitorMock.isNative.mockReturnValue(true);
    capacitorMock.platform.mockReturnValue('android');
  });

  it('loads and applies generic sync objects through the native plugin', testNativePluginBridge);

  it('returns empty results outside native Android runtime', testWebFallbackBridge);
});
