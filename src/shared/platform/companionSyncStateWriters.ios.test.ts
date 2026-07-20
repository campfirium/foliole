import { beforeEach, expect, it, vi } from 'vitest';

const runtimeMock = vi.hoisted(() => ({
  platform: vi.fn(() => 'ios'),
  plugin: {
    saveSyncActiveViewState: vi.fn(async () => ({ content_hash: 'hash-active', object_id: 'active' })),
    saveSyncNodeReadingRecord: vi.fn(async () => ({ content_hash: 'hash-reading', object_id: 'node-1' })),
    saveSyncNodeReviewRecord: vi.fn(async () => ({ content_hash: 'hash-review', object_id: 'node-1', op_id: 'op-1' })),
    saveSyncNodeViewState: vi.fn(async () => ({ content_hash: 'hash-view', object_id: 'view' })),
    saveSyncSettingRecord: vi.fn(async () => ({ content_hash: 'hash-setting', object_id: 'setting' }))
  },
  writer: vi.fn(async <T>(task: () => Promise<T>) => task())
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: runtimeMock.platform,
    isNativePlatform: vi.fn(() => true)
  },
  registerPlugin: vi.fn(() => runtimeMock.plugin)
}));

vi.mock('./companionSyncWriterQueue', () => ({
  runCompanionSyncWriterTask: runtimeMock.writer
}));

beforeEach(() => {
    vi.clearAllMocks();
    runtimeMock.platform.mockReturnValue('ios');
    runtimeMock.writer.mockImplementation(async <T>(task: () => Promise<T>) => task());
});

  it('dispatches active and node view writes through the shared native writer queue', async () => {
    const api = await import('./companionSyncStateWriters');

    await expect(api.saveCompanionSyncActiveViewState('node-1'))
      .resolves.toEqual({ content_hash: 'hash-active', object_id: 'active' });
    await expect(api.saveCompanionSyncNodeViewState({ nodeId: 'node-1', scrollTop: 42.8 }))
      .resolves.toEqual({ content_hash: 'hash-view', object_id: 'view' });
    expect(runtimeMock.plugin.saveSyncActiveViewState).toHaveBeenCalledWith({ node_id: 'node-1' });
    expect(runtimeMock.plugin.saveSyncNodeViewState).toHaveBeenCalledWith({
      node_id: 'node-1',
      scroll_top: 42,
      source: 'user-scroll'
    });
    expect(runtimeMock.writer).toHaveBeenCalledTimes(2);
  });

  it('dispatches reading writes through the shared native writer queue', async () => {
    const api = await import('./companionSyncStateWriters');

    await expect(api.saveCompanionSyncNodeReadingRecord({
      nodeId: 'node-1',
      reading: {
        intervalDurationMs: 60_000,
        intervalGrowthFactor: 1.5,
        lastHandledAt: '2026-07-20T12:00:00Z',
        nextAt: '2026-07-20T12:01:00Z',
        priority: 2,
        readingPosition: 42,
        repetitionCount: 3,
        state: 'active'
      }
    })).resolves.toEqual({ content_hash: 'hash-reading', object_id: 'node-1' });
    expect(runtimeMock.plugin.saveSyncNodeReadingRecord).toHaveBeenCalledWith({
      node_id: 'node-1',
      reading_json: JSON.stringify({
        interval_duration_ms: 60_000,
        interval_growth_factor: 1.5,
        last_handled_at: '2026-07-20T12:00:00Z',
        next_at: '2026-07-20T12:01:00Z',
        priority: 2,
        reading_position: 42,
        repetition_count: 3,
        state: 'active'
      })
    });
    expect(runtimeMock.writer).toHaveBeenCalledOnce();
  });

  it('dispatches review writes through the shared native writer queue', async () => {
    const api = await import('./companionSyncStateWriters');

    await expect(api.saveCompanionSyncNodeReviewRecord({
      nodeId: 'node-1',
      review: {
        difficulty: 5.2,
        due: '2026-07-27T12:00:00Z',
        elapsedDays: 3,
        lapses: 1,
        lastReviewAt: '2026-07-20T12:00:00Z',
        reps: 4,
        scheduledDays: 7,
        stability: 8.5,
        state: 2
      },
      reviewLog: {
        cardAfter: { difficulty: 5.2, due: '2026-07-27T12:00:00Z', stability: 8.5 },
        cardBefore: { difficulty: 6.1, due: '2026-07-20T12:00:00Z', stability: 4.2 },
        grade: 3,
        reviewedAt: '2026-07-20T12:00:00Z',
        schedulerVersion: 'fsrs-6'
      }
    })).resolves.toEqual({ content_hash: 'hash-review', object_id: 'node-1', op_id: 'op-1' });
    expect(runtimeMock.plugin.saveSyncNodeReviewRecord).toHaveBeenCalledWith(expect.objectContaining({
      node_id: 'node-1',
      review_json: expect.stringContaining('"stability":8.5'),
      review_log_json: expect.stringContaining('"schedulerVersion":"fsrs-6"')
    }));
    expect(runtimeMock.writer).toHaveBeenCalledOnce();
  });

  it('dispatches setting writes through the shared native writer queue', async () => {
    const api = await import('./companionSyncStateWriters');

    await expect(api.saveCompanionSyncSettingRecord({ key: 'one', valueJson: '{}' }))
      .resolves.toEqual({ content_hash: 'hash-setting', object_id: 'setting' });
    expect(runtimeMock.plugin.saveSyncSettingRecord).toHaveBeenCalledWith({
      device_id: '*',
      form_factor: 'phone',
      key: 'one',
      platform: 'ios',
      scope: 'device',
      value_json: '{}'
    });
    expect(runtimeMock.writer).toHaveBeenCalledOnce();
  });
