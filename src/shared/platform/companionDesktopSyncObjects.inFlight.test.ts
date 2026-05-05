import { beforeEach, expect, it, vi } from 'vitest';

const syncBridgeMock = vi.hoisted(() => ({
  applyCompanionDesktopSyncPack: vi.fn(async () => ({ applied_blob_count: 0, applied_object_count: 0, to_state_seq: 0 })),
  applyCompanionSyncNodeVersions: vi.fn(async () => []),
  applyCompanionSyncObjects: vi.fn(async () => []),
  applyCompanionSyncReviewLog: vi.fn(async () => []),
  loadCompanionSyncNodeVersionCursor: vi.fn(async () => null),
  loadCompanionSyncNodeVersionPushCursor: vi.fn(async () => null),
  loadCompanionSyncNodeVersions: vi.fn(async () => []),
  loadCompanionSyncReviewLogCursor: vi.fn(async () => null),
  loadCompanionSyncReviewLogPushCursor: vi.fn(async () => null),
  loadCompanionSyncReviewLog: vi.fn(async () => []),
  loadCompanionMissingContentBlobHashes: vi.fn(async () => []),
  loadCompanionSyncStateChanges: vi.fn(async () => []),
  loadCompanionSyncPackCursor: vi.fn(async () => null),
  loadCompanionSyncStateCursor: vi.fn(async () => null),
  loadCompanionSyncStatePushCursor: vi.fn(async () => null),
  saveCompanionSyncNodeVersionCursor: vi.fn(async (cursor) => cursor),
  saveCompanionSyncNodeVersionPushCursor: vi.fn(async (cursor) => cursor),
  saveCompanionSyncReviewLogCursor: vi.fn(async (cursor) => cursor),
  saveCompanionSyncReviewLogPushCursor: vi.fn(async (cursor) => cursor),
  saveCompanionSyncPackCursor: vi.fn(async (cursor) => cursor),
  saveCompanionSyncStateCursor: vi.fn(async (cursor) => cursor),
  saveCompanionSyncStatePushCursor: vi.fn(async (cursor) => cursor),
  syncCompanionContentBlob: vi.fn(async ({ hash }) => ({ availability: 'cached', hash }))
}));

const pairingMock = vi.hoisted(() => ({
  createSignedRequestHeaders: vi.fn(async () => ({ 'X-Signature': 'signed' }))
}));

vi.mock('./companionSyncObjects', () => syncBridgeMock);
vi.mock('./companionDesktopAttachmentResources', () => ({
  syncCompanionAttachmentResourcesFromDesktop: vi.fn(async () => [] as string[])
}));
vi.mock('./companionWorkspacePairing', () => pairingMock);

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it('reuses an in-flight sync for repeated requests to the same endpoint', async () => {
  let callCount = 0;
  const fetchResolvers: Array<() => void> = [];
  const fetchMock = vi.fn(async (url: string) => {
    callCount += 1;
    if (callCount === 1) {
      return await new Promise<ReturnType<typeof createEmptySyncResponse>>((resolve) => {
        fetchResolvers.push(() => resolve(createEmptySyncResponse(url)));
      });
    }
    return createEmptySyncResponse(url);
  });
  vi.stubGlobal('fetch', fetchMock);

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const firstSync = syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');
  const secondSync = syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(secondSync).toBe(firstSync);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

  fetchResolvers[0]?.();
  await expect(firstSync).resolves.toEqual(expect.objectContaining({ appliedObjectIds: [] }));
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(syncBridgeMock.applyCompanionDesktopSyncPack).toHaveBeenCalledTimes(1);
});

function createEmptySyncResponse(url: string) {
  return {
    json: async () => {
      if (url.includes('/companion/sync-node-versions')) return { nodes: [] };
      if (url.includes('/companion/sync-review-log')) return { reviews: [] };
      return { objects: [] };
    },
    ok: true
  };
}
