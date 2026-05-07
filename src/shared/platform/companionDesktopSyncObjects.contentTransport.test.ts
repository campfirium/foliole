import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  capacitorMock,
  resetCompanionDesktopSyncMocks,
  syncBridgeMock
} from './companionDesktopSyncObjects.testHarness';

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

async function testFallsBackToSingleBodyRequestsWhenNativeBatchFails() {
  const bodyHash = '4'.repeat(64);
  syncBridgeMock.loadCompanionMissingContentBlobs
    .mockResolvedValueOnce([{ hash: bodyHash, size_bytes: 1024 }])
    .mockResolvedValueOnce([]);
  syncBridgeMock.syncCompanionContentBlobs.mockRejectedValue(new Error('Batch endpoint unavailable.'));
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ acked_hashes: [bodyHash], status: 'ok' }), { status: 200 })));

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result.syncedContentBlobHashes).toEqual([bodyHash]);
  expect(syncBridgeMock.syncCompanionContentBlob).toHaveBeenCalledWith(expect.objectContaining({
    hash: bodyHash,
    url: `http://10.0.2.2:38641/companion/content-blob?hash=${bodyHash}`
  }));
}

describe('companion desktop sync content transport', () => {
  beforeEach(resetCompanionDesktopSyncMocks);

  it('routes content blob acknowledgements through native desktop HTTP on Android', testRoutesAckThroughNativeHttp);

  it('falls back to single body requests when native batch sync fails', testFallsBackToSingleBodyRequestsWhenNativeBatchFails);
});
