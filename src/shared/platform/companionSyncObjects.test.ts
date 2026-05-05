import { beforeEach, describe, expect, it, vi } from 'vitest';

const capacitorMock = vi.hoisted(() => ({
  isNative: vi.fn(() => true),
  platform: vi.fn(() => 'android'),
  plugin: {
    applySyncObjects: vi.fn(async () => ({ applied_object_ids: ['setting:one'] })),
    applySyncNodeVersions: vi.fn(async () => ({ applied_node_ids: ['node-1'] })),
    applySyncReviewLog: vi.fn(async () => ({ applied_op_ids: ['op-1'] })),
    loadSyncIndex: vi.fn(async () => ({ entries: [{ object_id: 'one', object_type: 'setting' }] })),
    loadSyncObjects: vi.fn(async () => ({ objects: [{ object_id: 'one', object_type: 'setting' }] })),
    loadSyncStateChanges: vi.fn(async () => ({ objects: [{ object_id: 'one', object_type: 'setting', state_seq: 1 }] })),
    loadSyncStateCursor: vi.fn(async () => ({ cursor: 2 })),
    loadSyncStatePushCursor: vi.fn(async () => ({ cursor: null })),
    loadSyncNodeVersionCursor: vi.fn(async () => ({ cursor: null })),
    loadSyncNodeVersionPushCursor: vi.fn(async () => ({ cursor: null })),
    loadSyncNodeVersions: vi.fn(async () => ({ nodes: [{ object_id: 'node-1' }] })),
    loadSyncReviewLogCursor: vi.fn(async () => ({ cursor: null })),
    loadSyncReviewLogPushCursor: vi.fn(async () => ({ cursor: null })),
    loadSyncReviewLog: vi.fn(async () => ({ reviews: [{ op_id: 'op-1' }] })),
    loadPdfPageText: vi.fn(async () => ({
      attachment_id: 'att-1',
      pages: [{ page: 1, page_height: 200, page_width: 100, text: 'indexed pdf text' }]
    })),
    searchPdfPageText: vi.fn(async () => ({
      query: 'pdf',
      results: [{
        attachment_id: 'att-1',
        excerpt: 'indexed pdf text',
        match_start: 8,
        page: 1,
        page_height: 200,
        page_width: 100,
        text: 'indexed pdf text'
      }]
    })),
    saveSyncActiveViewState: vi.fn(async () => ({ content_hash: 'hash-active', object_id: 'active' })),
    saveSyncNodeReadingRecord: vi.fn(async () => ({ content_hash: 'hash-reading', object_id: 'node-1' })),
    saveSyncNodeReviewRecord: vi.fn(async () => ({ content_hash: 'hash-review', object_id: 'node-1' })),
    saveSyncNodeViewState: vi.fn(async () => ({ content_hash: 'hash-view', object_id: 'view' })),
    saveSyncStateCursor: vi.fn(async ({ cursor }) => ({ cursor })),
    saveSyncStatePushCursor: vi.fn(async ({ cursor }) => ({ cursor })),
    saveSyncNodeVersionCursor: vi.fn(async ({ cursor }) => ({ cursor })),
    saveSyncNodeVersionPushCursor: vi.fn(async ({ cursor }) => ({ cursor })),
    saveSyncReviewLogCursor: vi.fn(async ({ cursor }) => ({ cursor })),
    saveSyncReviewLogPushCursor: vi.fn(async ({ cursor }) => ({ cursor })),
    saveSyncSettingRecord: vi.fn(async () => ({ content_hash: 'hash-setting', object_id: 'setting-1' })),
    syncAttachmentResource: vi.fn(async () => ({ attachment_id: 'att-1', availability: 'cached' }))
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
  expect(capacitorMock.plugin.saveSyncStateCursor).toHaveBeenCalledWith({ cursor: 3 });
  expect(capacitorMock.plugin.saveSyncStatePushCursor).toHaveBeenCalledWith({ cursor: 3 });
  expect(capacitorMock.plugin.saveSyncNodeVersionCursor).toHaveBeenCalledWith({ cursor });
  expect(capacitorMock.plugin.saveSyncNodeVersionPushCursor).toHaveBeenCalledWith({ cursor });
  expect(capacitorMock.plugin.saveSyncReviewLogCursor).toHaveBeenCalledWith({ cursor });
  expect(capacitorMock.plugin.saveSyncReviewLogPushCursor).toHaveBeenCalledWith({ cursor });
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

async function expectNativeCursorBridge(api: typeof import('./companionSyncObjects')) {
  const cursor = { change_id: 'change-2', created_at: '2026-04-25T00:01:00.000Z' };
  await expect(api.loadCompanionSyncStateCursor()).resolves.toBe(2);
  await expect(api.loadCompanionSyncStatePushCursor()).resolves.toBeNull();
  await expect(api.loadCompanionSyncNodeVersionCursor()).resolves.toBeNull();
  await expect(api.loadCompanionSyncNodeVersionPushCursor()).resolves.toBeNull();
  await expect(api.loadCompanionSyncReviewLogCursor()).resolves.toBeNull();
  await expect(api.loadCompanionSyncReviewLogPushCursor()).resolves.toBeNull();
  await expect(api.saveCompanionSyncStateCursor(3)).resolves.toBe(3);
  await expect(api.saveCompanionSyncStatePushCursor(3)).resolves.toBe(3);
  await expect(api.saveCompanionSyncNodeVersionCursor(cursor)).resolves.toEqual(cursor);
  await expect(api.saveCompanionSyncNodeVersionPushCursor(cursor)).resolves.toEqual(cursor);
  await expect(api.saveCompanionSyncReviewLogCursor(cursor)).resolves.toEqual(cursor);
  await expect(api.saveCompanionSyncReviewLogPushCursor(cursor)).resolves.toEqual(cursor);
  expectNativePluginCalls(cursor);
}

async function expectWebCursorFallback(api: typeof import('./companionSyncObjects')) {
  const cursor = { change_id: 'one', created_at: '2026-04-25T00:00:00.000Z' };
  await expect(api.loadCompanionSyncStateCursor()).resolves.toBeNull();
  await expect(api.loadCompanionSyncStatePushCursor()).resolves.toBeNull();
  await expect(api.loadCompanionSyncNodeVersionCursor()).resolves.toBeNull();
  await expect(api.loadCompanionSyncNodeVersionPushCursor()).resolves.toBeNull();
  await expect(api.loadCompanionSyncReviewLogCursor()).resolves.toBeNull();
  await expect(api.loadCompanionSyncReviewLogPushCursor()).resolves.toBeNull();
  await expect(api.saveCompanionSyncStateCursor(7)).resolves.toBe(7);
  await expect(api.saveCompanionSyncStatePushCursor(7)).resolves.toBe(7);
  await expect(api.saveCompanionSyncNodeVersionCursor(cursor)).resolves.toEqual(cursor);
  await expect(api.saveCompanionSyncNodeVersionPushCursor(cursor)).resolves.toEqual(cursor);
  await expect(api.saveCompanionSyncReviewLogCursor(cursor)).resolves.toEqual(cursor);
  await expect(api.saveCompanionSyncReviewLogPushCursor(cursor)).resolves.toEqual(cursor);
}

async function testNativePluginBridge() {
  const api = await import('./companionSyncObjects');
  await expect(api.loadCompanionSyncIndex()).resolves.toEqual([{ object_id: 'one', object_type: 'setting' }]);
  await expect(api.loadCompanionSyncObjects(['one'], ['setting'])).resolves.toEqual([{ object_id: 'one', object_type: 'setting' }]);
  await expect(api.loadCompanionSyncStateChanges(null)).resolves.toEqual([{ object_id: 'one', object_type: 'setting', state_seq: 1 }]);
  await expect(api.loadCompanionSyncNodeVersions(null)).resolves.toEqual([{ object_id: 'node-1' }]);
  await expect(api.loadCompanionSyncReviewLog(null)).resolves.toEqual([{ op_id: 'op-1' }]);
  await expect(api.loadCompanionPdfPageText('att-1')).resolves.toEqual([
    { page: 1, page_height: 200, page_width: 100, text: 'indexed pdf text' }
  ]);
  expect(capacitorMock.plugin.loadPdfPageText).toHaveBeenCalledWith({ attachment_id: 'att-1' });
  await expect(api.searchCompanionPdfPageText('pdf', 5)).resolves.toEqual([{
    attachment_id: 'att-1',
    excerpt: 'indexed pdf text',
    match_start: 8,
    page: 1,
    page_height: 200,
    page_width: 100,
    text: 'indexed pdf text'
  }]);
  expect(capacitorMock.plugin.searchPdfPageText).toHaveBeenCalledWith({ limit: 5, query: 'pdf' });
  await expect(api.loadCompanionPendingSyncSummary()).resolves.toEqual({ pendingCount: 3 });
  await expectNativeCursorBridge(api);
  await expect(api.saveCompanionSyncSettingRecord({ key: 'one', valueJson: '{}' }))
    .resolves.toEqual({ content_hash: 'hash-setting', object_id: 'setting-1' });
  await expect(api.saveCompanionSyncActiveViewState('node-1'))
    .resolves.toEqual({ content_hash: 'hash-active', object_id: 'active' });
  await expect(api.saveCompanionSyncNodeReadingRecord({
    nodeId: 'node-1',
    reading: createReadingProfile()
  })).resolves.toEqual({ content_hash: 'hash-reading', object_id: 'node-1' });
  expect(capacitorMock.plugin.saveSyncNodeReadingRecord).toHaveBeenCalledWith(expect.objectContaining({
    reading_json: expect.stringContaining('"reading_position"')
  }));
  await expect(api.saveCompanionSyncNodeReviewRecord({
    nodeId: 'node-1',
    review: createReviewProfile(),
    reviewLog: {
      cardAfter: { difficulty: 1.2, due: '2026-04-26T00:00:00.000Z', stability: 2.3 },
      cardBefore: { difficulty: 1, due: '2026-04-25T00:00:00.000Z', stability: 2 },
      grade: 3,
      reviewedAt: '2026-04-25T00:00:00.000Z',
      schedulerVersion: 'ts-fsrs@4'
    }
  })).resolves.toEqual({ content_hash: 'hash-review', object_id: 'node-1' });
  expect(capacitorMock.plugin.saveSyncNodeReviewRecord).toHaveBeenCalledWith(expect.objectContaining({
    node_id: 'node-1',
    review_json: expect.stringContaining('"last_review_at"'),
    review_log_json: expect.stringContaining('"reviewedAt"')
  }));
  await expect(api.saveCompanionSyncNodeViewState({ nodeId: 'node-1', scrollTop: 42.8 }))
    .resolves.toEqual({ content_hash: 'hash-view', object_id: 'view' });
  await expect(api.applyCompanionSyncObjects([{
    content_hash: 'hash',
    deleted_at: null,
    object_id: 'one',
    object_type: 'setting',
    payload_json: '{}',
    updated_at: '2026-04-25T00:00:00.000Z'
  }])).resolves.toEqual(['setting:one']);
  await expect(api.applyCompanionSyncNodeVersions([])).resolves.toEqual(['node-1']);
  await expect(api.applyCompanionSyncReviewLog([])).resolves.toEqual(['op-1']);
}

async function testWebFallbackBridge() {
  capacitorMock.isNative.mockReturnValue(false);
  const api = await import('./companionSyncObjects');
  await expect(api.loadCompanionSyncIndex()).resolves.toEqual([]);
  await expect(api.loadCompanionSyncObjects(['one'], ['setting'])).resolves.toEqual([]);
  await expect(api.loadCompanionSyncStateChanges(null)).resolves.toEqual([]);
  await expect(api.loadCompanionSyncNodeVersions(null)).resolves.toEqual([]);
  await expect(api.loadCompanionSyncReviewLog(null)).resolves.toEqual([]);
  await expect(api.loadCompanionPdfPageText('att-1')).resolves.toEqual([]);
  await expect(api.searchCompanionPdfPageText('pdf')).resolves.toEqual([]);
  await expect(api.loadCompanionPendingSyncSummary()).resolves.toEqual({ pendingCount: 0 });
  await expectWebCursorFallback(api);
  await expect(api.saveCompanionSyncSettingRecord({ key: 'one', valueJson: '{}' })).resolves.toBeNull();
  await expect(api.saveCompanionSyncActiveViewState('node-1')).resolves.toBeNull();
  await expect(api.saveCompanionSyncNodeReadingRecord({
    nodeId: 'node-1',
    reading: createReadingProfile()
  })).resolves.toBeNull();
  await expect(api.saveCompanionSyncNodeReviewRecord({
    nodeId: 'node-1',
    review: createReviewProfile()
  })).resolves.toBeNull();
  await expect(api.saveCompanionSyncNodeViewState({ nodeId: 'node-1', scrollTop: 42 })).resolves.toBeNull();
  await expect(api.applyCompanionSyncObjects([])).resolves.toEqual([]);
  await expect(api.applyCompanionSyncNodeVersions([])).resolves.toEqual([]);
  await expect(api.applyCompanionSyncReviewLog([])).resolves.toEqual([]);
}

describe('companion sync objects bridge', () => {
  beforeEach(() => {
    capacitorMock.isNative.mockReturnValue(true);
    capacitorMock.platform.mockReturnValue('android');
  });

  it('loads and applies generic sync objects through the native plugin', testNativePluginBridge);

  it('returns empty results outside native Android runtime', testWebFallbackBridge);
});
