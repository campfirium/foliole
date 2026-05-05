import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  NativeSyncChangeCursor,
  NativeSyncNodeRecord,
  NativeSyncObjectRecord,
  NativeSyncReviewLogRecord,
  NativeSyncStateObjectRecord
} from '../../../lib/platform/nativeSyncContract';

const syncBridgeMock = vi.hoisted(() => ({
  applyCompanionDesktopSyncPack: vi.fn(async () => ({ applied_blob_count: 0, applied_object_count: 0, to_state_seq: 0 })),
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
  loadCompanionMissingAttachmentResources: vi.fn(async () => [] as Array<{ attachment_id: string; content_hash: string }>),
  loadCompanionMissingContentBlobHashes: vi.fn(async () => [] as string[]),
  loadCompanionSyncStateChanges: vi.fn(async () => [] as NativeSyncStateObjectRecord[]),
  loadCompanionSyncPackCursor: vi.fn(async (): Promise<number | null> => null),
  loadCompanionSyncStateCursor: vi.fn(async (): Promise<number | null> => null),
  loadCompanionSyncStatePushCursor: vi.fn(async (): Promise<number | null> => null),
  saveCompanionSyncNodeVersionCursor: vi.fn(async (cursor: NativeSyncChangeCursor | null) => cursor),
  saveCompanionSyncNodeVersionPushCursor: vi.fn(async (cursor: NativeSyncChangeCursor | null) => cursor),
  saveCompanionSyncReviewLogCursor: vi.fn(async (cursor: NativeSyncChangeCursor | null) => cursor),
  saveCompanionSyncReviewLogPushCursor: vi.fn(async (cursor: NativeSyncChangeCursor | null) => cursor),
  saveCompanionSyncPackCursor: vi.fn(async (cursor: number | null) => cursor),
  saveCompanionSyncPushAcks: vi.fn(async () => [] as string[]),
  saveCompanionSyncStateCursor: vi.fn(async (cursor: number | null) => cursor),
  saveCompanionSyncStatePushCursor: vi.fn(async (cursor: number | null) => cursor),
  syncCompanionContentBlob: vi.fn(async ({ hash }: { hash: string }) => ({ availability: 'cached', hash }))
}));

vi.mock('./companionSyncObjects', () => syncBridgeMock);
vi.mock('./companionDesktopAttachmentResources', () => ({
  syncCompanionAttachmentResourceRequestsFromDesktop: vi.fn(async () => [] as string[]),
  syncCompanionAttachmentResourcesFromDesktop: vi.fn(async () => [] as string[])
}));
vi.mock('./companionWorkspacePairing', () => ({
  createSignedRequestHeaders: vi.fn(async () => ({ 'X-Device-Id': 'android-test-device' }))
}));

function createStateObject(index: number): NativeSyncStateObjectRecord {
  return {
    content_hash: `hash-${index}`,
    deleted_at: null,
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
  syncBridgeMock.loadCompanionMissingContentBlobHashes.mockResolvedValue([]);
  syncBridgeMock.loadCompanionSyncPackCursor.mockResolvedValue(null);
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
    expect(syncBridgeMock.saveCompanionSyncPackCursor).toHaveBeenLastCalledWith(501);
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
    expect(syncBridgeMock.loadCompanionSyncStateChanges).toHaveBeenCalledWith(null, 100);
    expect(syncBridgeMock.saveCompanionSyncStatePushCursor).not.toHaveBeenCalled();
  });

  it('does not expose the retired state diff bootstrap path', async () => {
    const syncObjects = await import('./companionDesktopSyncObjects');

    expect('bootstrapCompanionFromDesktopState' in syncObjects).toBe(false);
  });
});
