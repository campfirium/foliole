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
vi.mock('./companion/sync/syncGroupStore', () => ({
  loadCompanionSyncGroup: vi.fn(async () => null)
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
    await expect(api.loadCompanionPdfPageText('att-1')).resolves.toEqual([]);
    await expect(api.searchCompanionPdfPageText('pdf')).resolves.toEqual([]);
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
    expect(api).not.toHaveProperty('applyCompanionDesktopSyncPack');
    await expect(api.applyCompanionSyncNodeVersions([])).resolves.toEqual([]);
    await expect(api.applyCompanionSyncReviewLog([])).resolves.toEqual([]);
  });
});
