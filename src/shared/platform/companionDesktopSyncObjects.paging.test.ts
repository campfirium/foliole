import { beforeEach, describe, expect, it, vi } from 'vitest';

import { shouldApplySyncPackPage } from '../../../lib/core/sync/syncPackReceiveProgress';
import type {
  NativeSyncChangeCursor,
  NativeSyncNodeRecord,
  NativeSyncObjectRecord,
  NativeSyncPackApplyResult,
  NativeSyncReviewLogRecord,
  NativeSyncStateObjectRecord
} from '../../../lib/platform/nativeSyncContract';

const syncBridgeMock = vi.hoisted(() => ({
  applyCompanionDesktopSyncPack: vi.fn(async (args: { url: string }): Promise<NativeSyncPackApplyResult> => {
    void args;
    return { applied_blob_count: 0, applied_object_count: 0, to_state_seq: 0 };
  }),
  applyCompanionSyncNodeVersions: vi.fn(async (nodes: NativeSyncNodeRecord[]) => nodes.map((node) => node.object_id)),
  applyCompanionSyncObjects: vi.fn(async (objects: NativeSyncObjectRecord[]) => (
    objects.map((object) => `${object.object_type}:${object.object_id}`)
  )),
  applyCompanionSyncReviewLog: vi.fn(async (reviews: NativeSyncReviewLogRecord[]) => reviews.map((review) => review.op_id)),
  loadCompanionSyncNodeVersionCursor: vi.fn(async (): Promise<NativeSyncChangeCursor | null> => null),
  loadCompanionSyncNodeVersionPushCursor: vi.fn(async (): Promise<NativeSyncChangeCursor | null> => null),
  loadCompanionSyncNodeVersions: vi.fn(async () => [] as NativeSyncNodeRecord[]),
  loadCompanionSyncReviewLogCursor: vi.fn(async (): Promise<NativeSyncChangeCursor | null> => null),
  loadCompanionSyncReviewLogPushCursor: vi.fn(async (): Promise<NativeSyncChangeCursor | null> => null),
  loadCompanionSyncReviewLog: vi.fn(async () => [] as NativeSyncReviewLogRecord[]),
  loadCompanionMissingAttachmentResources: vi.fn(async () => [] as Array<{ attachment_id: string; content_hash: string; size_bytes?: number }>),
  loadCompanionMissingContentBlobs: vi.fn(async () => [] as Array<{ hash: string; size_bytes?: number }>),
  loadCompanionMissingContentBlobHashes: vi.fn(async () => [] as string[]),
  loadCompanionSyncStateChanges: vi.fn(async () => [] as NativeSyncStateObjectRecord[]),
  loadCompanionSyncPackCursor: vi.fn(async (): Promise<number | null> => null),
  loadCompanionSyncPackPosition: vi.fn(async (): Promise<{
    cursor: number; frontierStateSeq?: number; sourceEpoch?: string
  }> => ({ cursor: 0 })),
  loadCompanionSyncPackRestorePosition: vi.fn(async (): Promise<{
    cursor: number; frontierStateSeq?: number; sourceEpoch?: string
  }> => ({ cursor: 0 })),
  loadCompanionSyncStateCursor: vi.fn(async (): Promise<number | null> => null),
  loadCompanionSyncStatePushCursor: vi.fn(async (): Promise<number | null> => null),
  saveCompanionSyncNodeVersionCursor: vi.fn(async (cursor: NativeSyncChangeCursor | null) => cursor),
  saveCompanionSyncNodeVersionPushCursor: vi.fn(async (cursor: NativeSyncChangeCursor | null) => cursor),
  saveCompanionSyncReviewLogCursor: vi.fn(async (cursor: NativeSyncChangeCursor | null) => cursor),
  saveCompanionSyncReviewLogPushCursor: vi.fn(async (cursor: NativeSyncChangeCursor | null) => cursor),
  saveCompanionSyncPackCursor: vi.fn(async (cursor: number | null) => cursor),
  saveCompanionSyncPushAcks: vi.fn(async () => [] as string[]),
  stageCompanionSyncPushItems: vi.fn(async () => undefined),
  saveCompanionSyncStateCursor: vi.fn(async (cursor: number | null) => cursor),
  saveCompanionSyncStatePushCursor: vi.fn(async (cursor: number | null) => cursor),
  syncCompanionContentBlob: vi.fn(async ({ hash }: { hash: string }) => ({ availability: 'cached', hash }))
}));

vi.mock('./companionSyncObjects', () => syncBridgeMock);
vi.mock('./companion/sync/syncGroupStore', () => ({
  loadCompanionSyncGroup: vi.fn(async () => ({ group_id: 'group-test' }))
}));
vi.mock('./companion/sync/resources/syncResourceArticleQueue', () => ({
  loadCompanionResourceArticleBatch: vi.fn(async () => []),
  clearCompanionResourceArticles: vi.fn(async () => undefined)
}));
vi.mock('./companion/network/syncGroupPeerIdentity', () => ({
  resolveCompanionSyncPeerId: vi.fn(async () => 'authorization-desktop-test'),
  resolveCompanionSyncPeerHostName: vi.fn(async () => 'Desktop')
}));
vi.mock('./companionDesktopAttachmentResources', () => ({
  syncCompanionAttachmentResourceRequestsFromDesktop: vi.fn(async () => [] as string[]),
  syncCompanionAttachmentResourcesFromDesktop: vi.fn(async () => [] as string[])
}));
vi.mock('./companionDesktopSyncSummary', () => ({
  loadCompanionDesktopSyncSummary: vi.fn(async () => ({
    localDirtyCount: null,
    pendingAckCount: null,
    pushIssueCount: null,
    remainingAttachmentBreakdown: undefined,
    remainingAttachmentResourceBytes: null,
    remainingAttachmentResourceCount: null,
    remainingContentBreakdown: undefined,
    remainingContentBlobBytes: null,
    remainingContentBlobCount: null,
    remainingFailedAttachmentResourceBytes: null,
    remainingFailedAttachmentResourceCount: null,
    remainingFailedContentBlobBytes: null,
    remainingFailedContentBlobCount: null,
    remainingStructureChangeCount: null
  }))
}));
vi.mock('./companion/network/signedRequest', () => ({
  createSignedRequestHeaders: vi.fn(async () => ({ 'X-Authorization-Id': 'android-test-device' })),
  prepareNativeCompanionWorkgroupRequestIfPresent: vi.fn(async () => null),
  loadCompanionPairingState: vi.fn(async () => ({
    authorization_id: 'authorization-android-test',
    device_kind: 'android',
    remote_peer_id: 'authorization-desktop-test',
    remote_peer_name: 'Desktop Test Host'
  }))
}));

function createStateObject(index: number): NativeSyncStateObjectRecord {
  return {
    content_hash: `hash-${index}`,
    deleted_at: null,
    last_modified_by_host_name: 'android-test-device',
    object_id: `setting-${index}`,
    object_type: 'setting',
    payload_json: '{}',
    state_seq: index + 1,
    updated_at: `2026-04-25T00:${String(index).padStart(2, '0')}:00.000Z`
  };
}

async function runSync() {
  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  return await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');
}

function resetSyncMocks() {
  vi.resetAllMocks();
  syncBridgeMock.applyCompanionSyncObjects.mockImplementation(async (objects: NativeSyncObjectRecord[]) => (
    objects.map((object) => `${object.object_type}:${object.object_id}`)
  ));
  syncBridgeMock.loadCompanionSyncNodeVersionCursor.mockResolvedValue(null);
  syncBridgeMock.loadCompanionSyncNodeVersionPushCursor.mockResolvedValue(null);
  syncBridgeMock.loadCompanionSyncNodeVersions.mockResolvedValue([]);
  syncBridgeMock.loadCompanionSyncReviewLogCursor.mockResolvedValue(null);
  syncBridgeMock.loadCompanionSyncReviewLogPushCursor.mockResolvedValue(null);
  syncBridgeMock.loadCompanionSyncReviewLog.mockResolvedValue([]);
  syncBridgeMock.loadCompanionMissingAttachmentResources.mockResolvedValue([]);
  syncBridgeMock.loadCompanionMissingContentBlobs.mockResolvedValue([]);
  syncBridgeMock.loadCompanionMissingContentBlobHashes.mockResolvedValue([]);
  syncBridgeMock.loadCompanionSyncPackCursor.mockResolvedValue(null);
  syncBridgeMock.loadCompanionSyncPackPosition.mockResolvedValue({ cursor: 0 });
  syncBridgeMock.loadCompanionSyncPackRestorePosition.mockResolvedValue({ cursor: 0 });
  syncBridgeMock.loadCompanionSyncStateCursor.mockResolvedValue(null);
  syncBridgeMock.loadCompanionSyncStatePushCursor.mockResolvedValue(null);
  syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([]);
}

describe('companion desktop sync object paging', () => {
  beforeEach(resetSyncMocks);

  it('applies the remote structure pack and saves its pack cursor', async () => {
    syncBridgeMock.applyCompanionDesktopSyncPack.mockResolvedValue({
      applied_blob_count: 3,
      applied_object_count: 501,
      to_state_seq: 501
    });

    const result = await runSync();

    expect(result.changedObjectIds).toEqual([]);
    expect(result.appliedPackObjectCount).toBe(501);
    expect(result.appliedPackBlobCount).toBe(3);
    expect(syncBridgeMock.applyCompanionSyncObjects).not.toHaveBeenCalled();
    expect(syncBridgeMock.saveCompanionSyncPackCursor).toHaveBeenLastCalledWith(501, 'authorization-desktop-test');
  });

  it('requests a resumed restore page with its committed frontier and source epoch', async () => {
    syncBridgeMock.loadCompanionSyncPackRestorePosition.mockResolvedValueOnce({
      cursor: 5, frontierStateSeq: 8, sourceEpoch: 'epoch-a'
    });
    syncBridgeMock.applyCompanionDesktopSyncPack.mockResolvedValueOnce({
      applied_blob_count: 0, applied_object_count: 1, to_state_seq: 8
    });
    const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');

    await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/', {
      includeResources: false, restoreId: 'restore-a'
    });
    expect(syncBridgeMock.applyCompanionDesktopSyncPack).toHaveBeenCalledWith(
      expect.objectContaining({ expectedRestoreId: 'restore-a',
        url: expect.stringContaining('after_state_seq=5&page_contract=bounded-v1&restore_id=restore-a&frontier_state_seq=8&source_epoch=epoch-a') })
    );
  });

  it('does not page legacy local state changes while pack sync is active', async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => createStateObject(index));
    const secondPage = [createStateObject(500)];
    syncBridgeMock.loadCompanionSyncStateChanges
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce(secondPage);
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => ({
      json: async () => ({
        applied_object_ids: JSON.parse(String(init?.body ?? '{"objects":[]}')).objects
          .map((object: NativeSyncStateObjectRecord) => `${object.object_type}:${object.object_id}`),
        nodes: [],
        objects: [],
        reviews: []
      }),
      ok: true
    })));

    const result = await runSync();

    expect(result.pushedObjectIds).toEqual([]);
    expect(syncBridgeMock.loadCompanionSyncStateChanges).toHaveBeenCalledTimes(1);
    expect(syncBridgeMock.loadCompanionSyncStateChanges).toHaveBeenCalledWith('authorization-desktop-test', null, 100);
    expect(syncBridgeMock.saveCompanionSyncStatePushCursor).not.toHaveBeenCalled();
  });

  it('does not expose the retired state diff bootstrap path', async () => {
    const syncObjects = await import('./companionDesktopSyncObjects');

    expect('bootstrapCompanionFromDesktopState' in syncObjects).toBe(false);
  });
});

describe('multi-page structure receive', () => {
  beforeEach(resetSyncMocks);

  it('continues structure pages to the fixed frontier within one sync operation', async () => {
    syncBridgeMock.applyCompanionDesktopSyncPack
      .mockResolvedValueOnce({ applied_blob_count: 1, applied_object_count: 2,
        frontier_state_seq: 5, source_epoch: 'epoch-a', to_state_seq: 2,
        participating_article_ids: ['article-a'] })
      .mockResolvedValueOnce({ applied_blob_count: 0, applied_object_count: 1,
        frontier_state_seq: 5, source_epoch: 'epoch-a', to_state_seq: 5,
        participating_article_ids: ['article-b'] });

    const result = await runSync();

    expect(syncBridgeMock.applyCompanionDesktopSyncPack).toHaveBeenCalledTimes(2);
    expect(syncBridgeMock.applyCompanionDesktopSyncPack.mock.calls[1]![0].url)
      .toContain('after_state_seq=2&page_contract=bounded-v1&frontier_state_seq=5&source_epoch=epoch-a');
    expect(syncBridgeMock.saveCompanionSyncPackCursor).toHaveBeenLastCalledWith(5, 'authorization-desktop-test');
    expect(result.appliedPackObjectCount).toBe(3);
    expect(result.appliedPackBlobCount).toBe(1);
  });
});


it('finishes an interrupted ordinary round before consuming new source changes', async () => {
  resetSyncMocks();
  syncBridgeMock.loadCompanionSyncPackCursor.mockResolvedValue(5);
  syncBridgeMock.loadCompanionSyncPackPosition.mockResolvedValue({
    cursor: 5, frontierStateSeq: 8, sourceEpoch: 'epoch-a'
  });
  syncBridgeMock.applyCompanionDesktopSyncPack.mockImplementation(async ({ url }) => {
    const request = new URL(url);
    const frontier = Number(request.searchParams.get('frontier_state_seq') ?? 9);
    const page = { fromStateSeq: 5, toStateSeq: 8, frontierStateSeq: frontier, sourceEpoch: 'epoch-a' };
    shouldApplySyncPackPage(page, { completed: false, cursorStateSeq: 5,
      frontierStateSeq: 8, groupId: 'g', peerId: 'p', restoreId: null, sourceEpoch: 'epoch-a' }, 5, false);
    return { applied_blob_count: 0, applied_object_count: 1,
      to_state_seq: 8, frontier_state_seq: frontier, source_epoch: 'epoch-a' };
  });
  await expect(runSync()).resolves.toMatchObject({ appliedPackObjectCount: 1 });
  expect(syncBridgeMock.saveCompanionSyncPackCursor).toHaveBeenLastCalledWith(8, 'authorization-desktop-test');
});
