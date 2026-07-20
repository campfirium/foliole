import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeMock = vi.hoisted(() => ({
  platform: vi.fn(() => 'ios'),
  plugin: {
    saveSyncActiveViewState: vi.fn(async () => ({ content_hash: 'hash-active', object_id: 'active' })),
    saveSyncNodeReadingRecord: vi.fn(async () => ({ content_hash: 'hash-reading', object_id: 'node-1' })),
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

describe('iOS companion native writers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMock.platform.mockReturnValue('ios');
    runtimeMock.writer.mockImplementation(async <T>(task: () => Promise<T>) => task());
  });

  it('dispatches reading, setting, and view-state writes through the shared native writer queue', async () => {
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
    expect(runtimeMock.writer).toHaveBeenCalledTimes(4);
  });
});
