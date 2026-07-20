import { beforeEach, describe, expect, it, vi } from 'vitest';

const writerQueueMock = vi.hoisted(() => ({
  run: vi.fn(async <T>(task: () => Promise<T>) => task())
}));

vi.mock('./companionSyncWriterQueue', () => ({
  runCompanionSyncWriterTask: writerQueueMock.run
}));

const capacitorMock = vi.hoisted(() => ({
  isNative: vi.fn(() => true),
  platform: vi.fn(() => 'android'),
  plugin: {
    commitContentBlobBatch: vi.fn(async () => ({ db_elapsed_ms: 2, synced_hashes: ['a'.repeat(64)] })),
    downloadContentBlobBatch: vi.fn(async (): Promise<{
      batch_token: string;
      failed_hashes: string[];
      http_elapsed_ms?: number;
      parse_elapsed_ms?: number;
      synced_hashes: string[];
      total_elapsed_ms?: number;
    }> => ({
      batch_token: 'content-batch-token',
      failed_hashes: [],
      http_elapsed_ms: 3,
      parse_elapsed_ms: 1,
      synced_hashes: ['a'.repeat(64)]
    })),
    loadMissingContentBlobHashes: vi.fn(async () => ({ hashes: ['a'.repeat(64)] })),
    syncContentBlob: vi.fn()
  }
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: capacitorMock.platform,
    isNativePlatform: capacitorMock.isNative
  },
  registerPlugin: vi.fn(() => capacitorMock.plugin)
}));

describe('companion content blob sync split bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capacitorMock.isNative.mockReturnValue(true);
    capacitorMock.platform.mockReturnValue('android');
  });

  it('downloads outside the writer queue and commits by token inside it', async () => {
    const api = await import('./companionContentBlobSync');
    await expect(api.syncCompanionContentBlob({
      hash: 'a'.repeat(64),
      headers: { 'X-Device-Id': 'android' },
      url: 'http://desktop/companion/content-blobs'
    })).resolves.toEqual({ availability: 'cached', hash: 'a'.repeat(64) });

    expect(capacitorMock.plugin.downloadContentBlobBatch).toHaveBeenCalledWith({
      body: JSON.stringify({ hashes: ['a'.repeat(64)] }),
      headers: { 'X-Device-Id': 'android' },
      url: 'http://desktop/companion/content-blobs'
    });
    expect(capacitorMock.plugin.commitContentBlobBatch).toHaveBeenCalledWith({
      batch_token: 'content-batch-token'
    });
    expect(capacitorMock.plugin.syncContentBlob).not.toHaveBeenCalled();
    expect(capacitorMock.plugin.downloadContentBlobBatch.mock.invocationCallOrder[0]!)
      .toBeLessThan(writerQueueMock.run.mock.invocationCallOrder[0]!);
  });

  it('still commits a downloaded failure token so native can mark failed hashes', async () => {
    capacitorMock.plugin.downloadContentBlobBatch.mockResolvedValueOnce({
      batch_token: 'failed-content-batch-token',
      failed_hashes: ['b'.repeat(64)],
      synced_hashes: []
    });
    capacitorMock.plugin.commitContentBlobBatch.mockResolvedValueOnce({
      db_elapsed_ms: 1,
      synced_hashes: []
    });

    const api = await import('./companionContentBlobSync');
    await expect(api.syncCompanionContentBlobs({
      body: JSON.stringify({ hashes: ['b'.repeat(64)] }),
      headers: { 'X-Device-Id': 'android' },
      url: 'http://desktop/companion/content-blobs'
    })).resolves.toEqual(expect.objectContaining({ synced_hashes: [] }));

    expect(capacitorMock.plugin.commitContentBlobBatch).toHaveBeenCalledWith({
      batch_token: 'failed-content-batch-token'
    });
  });

  it('routes iOS missing-body queries through the same native contract', async () => {
    capacitorMock.platform.mockReturnValue('ios');
    const api = await import('./companionContentBlobSync');

    await expect(api.loadCompanionMissingContentBlobHashes(3)).resolves.toEqual(['a'.repeat(64)]);
    expect(capacitorMock.plugin.loadMissingContentBlobHashes).toHaveBeenCalledWith({ limit: 3 });
  });
});
