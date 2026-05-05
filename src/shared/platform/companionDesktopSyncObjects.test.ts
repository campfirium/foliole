import { beforeEach, describe, expect, it, vi } from 'vitest';

const syncBridgeMock = vi.hoisted(() => ({
  applyCompanionDesktopSyncPack: vi.fn(async () => ({ applied_blob_count: 2, applied_object_count: 3, to_state_seq: 8 })),
  loadCompanionMissingContentBlobHashes: vi.fn(async () => [] as string[]),
  loadCompanionSyncPackCursor: vi.fn(async (): Promise<number | null> => null),
  saveCompanionSyncPackCursor: vi.fn(async (cursor: number | null) => cursor),
  syncCompanionContentBlob: vi.fn(async ({ hash }: { hash: string }) => ({ availability: 'cached', hash }))
}));

const pairingMock = vi.hoisted(() => ({
  createSignedRequestHeaders: vi.fn(async ({ pathWithQuery }: { pathWithQuery: string }) => ({
    'X-Device-Id': 'android-test-device',
    'X-Signature': `signed:${pathWithQuery}`
  }))
}));

vi.mock('./companionSyncObjects', () => syncBridgeMock);
vi.mock('./companionWorkspacePairing', () => pairingMock);

async function testPullsStructurePackAndContentBlobs() {
  const bodyHash = 'a'.repeat(64);
  syncBridgeMock.loadCompanionMissingContentBlobHashes
    .mockResolvedValueOnce([bodyHash])
    .mockResolvedValueOnce([]);
  const fetchMock = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal('fetch', fetchMock);

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result).toMatchObject({
    appliedPackBlobCount: 2,
    appliedPackObjectCount: 3,
    syncedContentBlobHashes: [bodyHash]
  });
  expect(syncBridgeMock.applyCompanionDesktopSyncPack).toHaveBeenCalledWith({
    headers: {
      'X-Device-Id': 'android-test-device',
      'X-Signature': 'signed:/companion/sync-pack?after_state_seq=0'
    },
    url: 'http://10.0.2.2:38641/companion/sync-pack?after_state_seq=0'
  });
  expect(syncBridgeMock.saveCompanionSyncPackCursor).toHaveBeenCalledWith(8);
  expect(syncBridgeMock.syncCompanionContentBlob).toHaveBeenCalledWith({
    hash: bodyHash,
    headers: {
      'X-Device-Id': 'android-test-device',
      'X-Signature': `signed:/companion/content-blob?hash=${bodyHash}`
    },
    url: `http://10.0.2.2:38641/companion/content-blob?hash=${bodyHash}`
  });
  expect(fetchMock).toHaveBeenCalledWith('http://10.0.2.2:38641/companion/content-blob/ack', {
    body: JSON.stringify({ hashes: [bodyHash] }),
    headers: {
      'Content-Type': 'application/json',
      'X-Device-Id': 'android-test-device',
      'X-Signature': 'signed:/companion/content-blob/ack'
    },
    method: 'POST'
  });
}

async function testNoLegacyJsonStreams() {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result).toMatchObject({
    appliedNodeIds: [],
    appliedObjectIds: [],
    appliedReviewOpIds: [],
    changedObjectIds: [],
    pushedNodeIds: [],
    pushedObjectIds: [],
    pushedReviewOpIds: [],
    syncedAttachmentIds: []
  });
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/companion/sync-state'), expect.any(Object));
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/companion/sync-node-versions'), expect.any(Object));
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/companion/sync-review-log'), expect.any(Object));
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/companion/sync-objects'), expect.any(Object));
}

async function testFailsWhenStageNeverReturns() {
  vi.useFakeTimers();
  syncBridgeMock.applyCompanionDesktopSyncPack.mockReturnValue(new Promise(() => undefined));

  const {
    COMPANION_DESKTOP_SYNC_STEP_TIMEOUT_MS,
    syncCompanionObjectsFromDesktop
  } = await import('./companionDesktopSyncObjects');
  const sync = syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');
  const assertion = expect(sync).rejects.toThrow('Desktop sync timed out while applying the structure pack.');
  await vi.advanceTimersByTimeAsync(COMPANION_DESKTOP_SYNC_STEP_TIMEOUT_MS);

  await assertion;
  vi.useRealTimers();
}

describe('companion desktop sync objects', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
    syncBridgeMock.applyCompanionDesktopSyncPack.mockResolvedValue({
      applied_blob_count: 2,
      applied_object_count: 3,
      to_state_seq: 8
    });
    syncBridgeMock.loadCompanionMissingContentBlobHashes.mockResolvedValue([]);
    syncBridgeMock.loadCompanionSyncPackCursor.mockResolvedValue(null);
    syncBridgeMock.saveCompanionSyncPackCursor.mockImplementation(async (cursor: number | null) => cursor);
    syncBridgeMock.syncCompanionContentBlob.mockImplementation(async ({ hash }: { hash: string }) => ({
      availability: 'cached',
      hash
    }));
    pairingMock.createSignedRequestHeaders.mockImplementation(async ({ pathWithQuery }: { pathWithQuery: string }) => ({
      'X-Device-Id': 'android-test-device',
      'X-Signature': `signed:${pathWithQuery}`
    }));
  });

  it('pulls the structure pack and missing content blobs from desktop', testPullsStructurePackAndContentBlobs);

  it('does not run legacy JSON state, topic, or review streams on the normal pull path', testNoLegacyJsonStreams);

  it('fails instead of staying in sync when a desktop sync stage never returns', testFailsWhenStageNeverReturns);
});
