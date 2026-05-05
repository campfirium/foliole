import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  NativeSyncChangeCursor,
  NativeSyncIndexEntry,
  NativeSyncNodeRecord,
  NativeSyncReviewLogRecord,
  NativeSyncStateObjectRecord
} from '../../../lib/platform/nativeSyncContract';

const syncBridgeMock = vi.hoisted(() => ({
  applyCompanionDesktopSyncPack: vi.fn(async () => ({ applied_blob_count: 0, applied_object_count: 0, to_state_seq: 0 })),
  applyCompanionSyncNodeVersions: vi.fn(async () => [] as string[]),
  applyCompanionSyncObjects: vi.fn(async () => [] as string[]),
  applyCompanionSyncReviewLog: vi.fn(async () => [] as string[]),
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
  saveCompanionSyncPushAcks: vi.fn(async () => [] as string[]),
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

function createLocalStateChange(): NativeSyncStateObjectRecord {
  return {
    base_content_hash: null,
    content_hash: 'local-hash',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_reading',
    payload_json: '{"reading_position":42}',
    state_seq: 9,
    updated_at: '2026-04-25T00:04:00.000Z'
  };
}

function createLocalNodeReviewChange(): NativeSyncStateObjectRecord {
  return {
    base_content_hash: 'desktop-base',
    content_hash: 'local-review-hash',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_review',
    payload_json: '{"reps":2}',
    state_seq: 10,
    updated_at: '2026-04-25T00:05:00.000Z'
  };
}

function createLocalReviewLog(): NativeSyncReviewLogRecord {
  return {
    device_id: 'android-test-device',
    difficulty_after: 3,
    difficulty_before: 2,
    due_after: '2026-04-26T00:00:00.000Z',
    due_before: '2026-04-25T00:00:00.000Z',
    grade: 3,
    id: 'review-op-1',
    node_id: 'node-1',
    op_id: 'op-1',
    reviewed_at: '2026-04-25T00:05:00.000Z',
    scheduler_version: 'ts-fsrs@4',
    stability_after: 4,
    stability_before: 3
  };
}

function parsePushItems(init: RequestInit | undefined) {
  return JSON.parse(String(init?.body ?? '{}')) as {
    items: Array<{ clientOpId: string; identity: { objectId: string; objectType: string } }>;
  };
}

describe('companion desktop sync push acknowledgements', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([createLocalStateChange()]);
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => ({
      json: async () => {
        if (init?.method === 'POST' && url.includes('/companion/sync-push')) {
          return {
            acks: parsePushItems(init).items.map((item) => ({
              client_op_id: item.clientOpId,
              identity: item.identity,
              status: 'accepted'
            }))
          };
        }
        return { nodes: [], objects: [], reviews: [] };
      },
      ok: true
    })));
  });

  it('does not push non-review state dirty through the new push endpoint', async () => {
    const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');

    const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

    expect(result.pushedObjectIds).toEqual([]);
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/companion/sync-push'), expect.any(Object));
    expect(syncBridgeMock.saveCompanionSyncStatePushCursor).not.toHaveBeenCalled();
  });

  it('pushes node_review and review_log, storing state acks and advancing accepted review log cursor', async () => {
    syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([createLocalNodeReviewChange()]);
    syncBridgeMock.loadCompanionSyncReviewLog.mockResolvedValue([createLocalReviewLog()]);
    const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');

    const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

    expect(fetch).toHaveBeenCalledWith('http://10.0.2.2:38641/companion/sync-push', expect.objectContaining({
      body: expect.stringContaining('"baseContentHash":"desktop-base"'),
      method: 'POST'
    }));
    expect(result.pushedObjectIds).toEqual(['node_review:node-1']);
    expect(result.pushedReviewOpIds).toEqual(['op-1']);
    expect(syncBridgeMock.saveCompanionSyncPushAcks).toHaveBeenCalledWith([
      expect.objectContaining({ clientOpId: 'node_review:node-1:10', status: 'accepted' })
    ]);
    expect(syncBridgeMock.saveCompanionSyncStatePushCursor).not.toHaveBeenCalled();
    expect(syncBridgeMock.saveCompanionSyncReviewLogPushCursor).toHaveBeenCalledWith({
      change_id: 'op-1',
      created_at: '2026-04-25T00:05:00.000Z'
    });
  });

  it('skips legacy node_review dirty rows that do not have a base reference', async () => {
    syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([{
      ...createLocalNodeReviewChange(),
      base_content_hash: null
    }]);
    const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');

    const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

    expect(result.pushedObjectIds).toEqual([]);
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/companion/sync-push'), expect.any(Object));
  });
});
