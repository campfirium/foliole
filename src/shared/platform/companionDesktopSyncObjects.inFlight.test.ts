import { beforeEach, expect, it, vi } from 'vitest';

const syncBridgeMock = vi.hoisted(() => ({
  applyCompanionDesktopSyncPack: vi.fn(async () => ({ applied_blob_count: 0, applied_object_count: 0, to_state_seq: 0 })),
  loadCompanionMissingContentBlobHashes: vi.fn(async () => [] as string[]),
  loadCompanionSyncPackCursor: vi.fn(async () => null),
  loadCompanionSyncReviewLog: vi.fn(async () => []),
  loadCompanionSyncReviewLogPushCursor: vi.fn(async () => null),
  loadCompanionSyncStateChanges: vi.fn(async () => []),
  loadCompanionSyncStatePushCursor: vi.fn(async () => null),
  saveCompanionSyncPackCursor: vi.fn(async (cursor: number | null) => cursor),
  saveCompanionSyncPushAcks: vi.fn(async () => [] as string[]),
  syncCompanionContentBlob: vi.fn(async ({ hash }: { hash: string }) => ({ availability: 'cached', hash }))
}));

const pairingMock = vi.hoisted(() => ({
  createSignedRequestHeaders: vi.fn(async () => ({ 'X-Signature': 'signed' }))
}));

vi.mock('./companionSyncObjects', () => syncBridgeMock);
vi.mock('./companionWorkspacePairing', () => pairingMock);

beforeEach(() => {
  vi.resetAllMocks();
});

it('reuses an in-flight sync for repeated requests to the same endpoint', async () => {
  const packResolvers: Array<() => void> = [];
  syncBridgeMock.applyCompanionDesktopSyncPack.mockImplementation(async () => (
    await new Promise<{ applied_blob_count: number; applied_object_count: number; to_state_seq: number }>((resolve) => {
      packResolvers.push(() => resolve({ applied_blob_count: 0, applied_object_count: 0, to_state_seq: 0 }));
    })
  ));

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const firstSync = syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');
  const secondSync = syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(secondSync).toBe(firstSync);
  await vi.waitFor(() => expect(syncBridgeMock.applyCompanionDesktopSyncPack).toHaveBeenCalledTimes(1));

  packResolvers[0]?.();
  await expect(firstSync).resolves.toEqual(expect.objectContaining({ appliedObjectIds: [] }));
  expect(syncBridgeMock.applyCompanionDesktopSyncPack).toHaveBeenCalledTimes(1);
});
