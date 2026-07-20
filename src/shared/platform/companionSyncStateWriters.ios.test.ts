import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeMock = vi.hoisted(() => ({
  platform: vi.fn(() => 'ios'),
  plugin: {
    saveSyncActiveViewState: vi.fn(async () => ({ content_hash: 'hash-active', object_id: 'active' })),
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

  it('dispatches setting and view-state writes through the shared native writer queue', async () => {
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
    expect(runtimeMock.writer).toHaveBeenCalledTimes(3);
  });
});
