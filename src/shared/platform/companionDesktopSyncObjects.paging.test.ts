import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  NativeSyncChangeCursor,
  NativeSyncIndexEntry,
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
  loadCompanionSyncIndex: vi.fn(async (): Promise<NativeSyncIndexEntry[]> => []),
  loadCompanionSyncNodeVersionCursor: vi.fn(async (): Promise<NativeSyncChangeCursor | null> => null),
  loadCompanionSyncNodeVersionPushCursor: vi.fn(async (): Promise<NativeSyncChangeCursor | null> => null),
  loadCompanionSyncNodeVersions: vi.fn(async () => [] as NativeSyncNodeRecord[]),
  loadCompanionSyncReviewLogCursor: vi.fn(async (): Promise<NativeSyncChangeCursor | null> => null),
  loadCompanionSyncReviewLogPushCursor: vi.fn(async (): Promise<NativeSyncChangeCursor | null> => null),
  loadCompanionSyncReviewLog: vi.fn(async () => [] as NativeSyncReviewLogRecord[]),
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
  saveCompanionSyncStateCursor: vi.fn(async (cursor: number | null) => cursor),
  saveCompanionSyncStatePushCursor: vi.fn(async (cursor: number | null) => cursor),
  syncCompanionContentBlob: vi.fn(async ({ hash }: { hash: string }) => ({ availability: 'cached', hash }))
}));

vi.mock('./companionSyncObjects', () => syncBridgeMock);
vi.mock('./companionDesktopAttachmentResources', () => ({
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

function createEntry(objectId: string, contentHash: string, updatedAt: string): NativeSyncIndexEntry {
  return {
    content_hash: contentHash,
    object_id: objectId,
    object_type: 'setting',
    sync_version_id: null,
    updated_at: updatedAt
  };
}

function stubFetchForPagedPull(firstPage: NativeSyncStateObjectRecord[], secondPage: NativeSyncStateObjectRecord[]) {
  return vi.fn(async (url: string) => ({
    json: async () => {
      if (url.includes('/companion/sync-index')) return { entries: [] };
      if (url.includes('/companion/sync-node-versions')) return { nodes: [] };
      if (url.includes('/companion/sync-review-log')) return { reviews: [] };
      if (url.includes('after_state_seq=500')) return { objects: secondPage };
      return { objects: firstPage };
    },
    ok: true
  }));
}

async function runSync() {
  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  return await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');
}

async function runBootstrap() {
  const { bootstrapCompanionFromDesktopState } = await import('./companionDesktopSyncObjects');
  return await bootstrapCompanionFromDesktopState('http://10.0.2.2:38641/');
}

function resetSyncMocks() {
  vi.resetAllMocks();
  syncBridgeMock.applyCompanionSyncObjects.mockImplementation(async (objects: NativeSyncObjectRecord[]) => (
    objects.map((object) => `${object.object_type}:${object.object_id}`)
  ));
  syncBridgeMock.loadCompanionSyncIndex.mockResolvedValue([]);
  syncBridgeMock.loadCompanionSyncNodeVersionCursor.mockResolvedValue(null);
  syncBridgeMock.loadCompanionSyncNodeVersionPushCursor.mockResolvedValue(null);
  syncBridgeMock.loadCompanionSyncNodeVersions.mockResolvedValue([]);
  syncBridgeMock.loadCompanionSyncReviewLogCursor.mockResolvedValue(null);
  syncBridgeMock.loadCompanionSyncReviewLogPushCursor.mockResolvedValue(null);
  syncBridgeMock.loadCompanionSyncReviewLog.mockResolvedValue([]);
  syncBridgeMock.loadCompanionMissingContentBlobHashes.mockResolvedValue([]);
  syncBridgeMock.loadCompanionSyncPackCursor.mockResolvedValue(null);
  syncBridgeMock.loadCompanionSyncStateCursor.mockResolvedValue(null);
  syncBridgeMock.loadCompanionSyncStatePushCursor.mockResolvedValue(null);
  syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([]);
}

describe('companion desktop sync object paging', () => {
  beforeEach(resetSyncMocks);

  it('pulls multiple remote change pages without invoking state diff', async () => {
    const firstPage = Array.from({ length: 500 }, (_, index) => createStateObject(index));
    const secondPage = [createStateObject(500)];
    const fetchMock = stubFetchForPagedPull(firstPage, secondPage);
    vi.stubGlobal('fetch', fetchMock);

    const result = await runSync();

    expect(result.changedObjectIds).toHaveLength(501);
    expect(syncBridgeMock.applyCompanionSyncObjects).toHaveBeenCalledTimes(2);
    expect(syncBridgeMock.saveCompanionSyncStateCursor).toHaveBeenLastCalledWith(501);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('after_state_seq=500'),
      expect.any(Object)
    );
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/companion/sync-index'), expect.any(Object));
  });

  it('pushes multiple local change pages before saving the final push cursor', async () => {
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

    expect(result.pushedObjectIds).toHaveLength(501);
    expect(syncBridgeMock.loadCompanionSyncStateChanges).toHaveBeenLastCalledWith(500, 500);
    expect(syncBridgeMock.saveCompanionSyncStatePushCursor).toHaveBeenLastCalledWith(501);
  });

  it('keeps state diff behind the explicit bootstrap entry point', async () => {
    syncBridgeMock.loadCompanionSyncIndex.mockResolvedValue([
      createEntry('setting-1', 'local-newer-hash', '2026-04-25T00:10:00.000Z')
    ]);
    const fetchMock = vi.fn(async (url: string) => ({
      json: async () => url.includes('/companion/sync-index')
        ? { entries: [createEntry('setting-1', 'remote-older-hash', '2026-04-25T00:09:00.000Z')] }
        : { changes: [] },
      ok: true
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runBootstrap();

    expect(result.requestedObjectIds).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/companion/sync-objects'), expect.any(Object));
  });
});
