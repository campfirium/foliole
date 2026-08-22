import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  capacitorMock,
  resetCompanionDesktopSyncMocks,
  syncBridgeMock
} from './companionDesktopSyncObjects.testHarness';

vi.mock('./companion/network/signedRequest', async (importOriginal) => ({
  ...await importOriginal<typeof import('./companion/network/signedRequest')>(),
  prepareNativeCompanionWorkgroupRequestIfPresent: vi.fn(async () => null)
}));

async function testRoutesAckThroughNativeHttp() {
  capacitorMock.getPlatform.mockReturnValue('android');
  capacitorMock.isNativePlatform.mockReturnValue(true);
  const bodyHash = 'b'.repeat(64);
  syncBridgeMock.loadCompanionMissingContentBlobs
    .mockResolvedValueOnce([{ hash: bodyHash, size_bytes: 1024 }])
    .mockResolvedValueOnce([]);
  capacitorMock.plugin.desktopHttpRequest.mockResolvedValue({
    body: JSON.stringify({ acked_hashes: [bodyHash], status: 'ok' }),
    status: 200
  });
  vi.stubGlobal('fetch', vi.fn());

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  await expect(syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/')).resolves.toMatchObject({
    syncedContentBlobHashes: [bodyHash]
  });
  expect(fetch).not.toHaveBeenCalled();
  expect(capacitorMock.plugin.desktopHttpRequest).toHaveBeenCalledWith(expect.objectContaining({
    method: 'POST',
    url: 'http://10.0.2.2:38641/companion/content-blob/ack'
  }));
}

async function testFallsBackToSingleBodyBatchWhenNativeBatchFails() {
  const bodyHash = '4'.repeat(64);
  syncBridgeMock.loadCompanionMissingContentBlobs
    .mockResolvedValueOnce([{ hash: bodyHash, size_bytes: 1024 }])
    .mockResolvedValueOnce([]);
  syncBridgeMock.syncCompanionContentBlobs.mockRejectedValueOnce(new Error('Batch endpoint unavailable.'));
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ acked_hashes: [bodyHash], status: 'ok' }), { status: 200 })));

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result.syncedContentBlobHashes).toEqual([bodyHash]);
  expect(syncBridgeMock.syncCompanionContentBlob).not.toHaveBeenCalled();
  expect(syncBridgeMock.syncCompanionContentBlobs).toHaveBeenLastCalledWith(expect.objectContaining({
    body: JSON.stringify({ hashes: [bodyHash] }),
    headers: expect.objectContaining({
      'X-Signature': 'signed:/companion/content-blobs'
    }),
    url: 'http://10.0.2.2:38641/companion/content-blobs'
  }));
}

describe('companion desktop sync content transport', () => {
  beforeEach(resetCompanionDesktopSyncMocks);

  it('routes content blob acknowledgements through native desktop HTTP on Android', testRoutesAckThroughNativeHttp);

  it('falls back to a single body split batch when native batch sync fails', testFallsBackToSingleBodyBatchWhenNativeBatchFails);
});
