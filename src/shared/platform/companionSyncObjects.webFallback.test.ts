import { beforeEach, describe, expect, it, vi } from 'vitest';

const capacitorMock = vi.hoisted(() => ({
  isNative: vi.fn(() => false),
  platform: vi.fn(() => 'web'),
  plugin: {}
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: capacitorMock.platform,
    isNativePlatform: capacitorMock.isNative
  },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
}));

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

async function expectWebCursorFallback(api: typeof import('./companionSyncObjects')) {
  const cursor = { change_id: 'one', created_at: '2026-04-25T00:00:00.000Z' };
  await expect(api.loadCompanionSyncStateCursor()).resolves.toBeNull();
  await expect(api.loadCompanionSyncPackCursor()).resolves.toBeNull();
  await expect(api.loadCompanionSyncStatePushCursor()).resolves.toBeNull();
  await expect(api.loadCompanionSyncNodeVersionCursor()).resolves.toBeNull();
  await expect(api.loadCompanionSyncNodeVersionPushCursor()).resolves.toBeNull();
  await expect(api.loadCompanionSyncReviewLogCursor()).resolves.toBeNull();
  await expect(api.loadCompanionSyncReviewLogPushCursor()).resolves.toBeNull();
  await expect(api.saveCompanionSyncStateCursor(7)).resolves.toBe(7);
  await expect(api.saveCompanionSyncPackCursor(9)).resolves.toBe(9);
  await expect(api.saveCompanionSyncStatePushCursor(7)).resolves.toBe(7);
  await expect(api.saveCompanionSyncNodeVersionCursor(cursor)).resolves.toEqual(cursor);
  await expect(api.saveCompanionSyncNodeVersionPushCursor(cursor)).resolves.toEqual(cursor);
  await expect(api.saveCompanionSyncReviewLogCursor(cursor)).resolves.toEqual(cursor);
  await expect(api.saveCompanionSyncReviewLogPushCursor(cursor)).resolves.toEqual(cursor);
}

describe('companion sync objects web fallback', () => {
  beforeEach(() => {
    capacitorMock.isNative.mockReturnValue(false);
    capacitorMock.platform.mockReturnValue('web');
  });

  it('returns empty results outside native Android runtime', async () => {
    const api = await import('./companionSyncObjects');
    await expect(api.loadCompanionSyncIndex()).resolves.toEqual([]);
    await expect(api.loadCompanionSyncNodeConflicts()).resolves.toEqual([]);
    await expect(api.loadCompanionSyncObjects(['one'], ['setting'])).resolves.toEqual([]);
    await expect(api.loadCompanionSyncStateChanges(null)).resolves.toEqual([]);
    await expect(api.loadCompanionMissingContentBlobHashes()).resolves.toEqual([]);
    await expect(api.syncCompanionContentBlob({
      hash: 'a'.repeat(64),
      headers: {},
      url: 'http://desktop/companion/content-blob?hash=a'
    })).resolves.toEqual({ availability: 'missing', hash: 'a'.repeat(64) });
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
    await expect(api.applyCompanionSyncPack('/tmp/pack.db')).resolves.toEqual({
      applied_blob_count: 0,
      applied_object_count: 0,
      to_state_seq: 0
    });
    await expect(api.applyCompanionDesktopSyncPack({ headers: {}, url: 'http://desktop/pack.db' })).resolves.toEqual({
      applied_blob_count: 0,
      applied_object_count: 0,
      to_state_seq: 0
    });
    await expect(api.applyCompanionSyncNodeVersions([])).resolves.toEqual([]);
    await expect(api.applyCompanionSyncReviewLog([])).resolves.toEqual([]);
    await expect(api.saveCompanionSyncPushAcks([])).resolves.toEqual([]);
  });
});
