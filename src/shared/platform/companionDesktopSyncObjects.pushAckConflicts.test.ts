import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  NativeSyncChangeCursor,
  NativeSyncIndexEntry,
  NativeSyncNodeRecord,
  NativeSyncReviewLogRecord,
  NativeSyncStateObjectRecord
} from '../../../lib/platform/nativeSyncContract';

import {
  createLocalNodeReadingChange,
  createLocalNodeReviewChange,
  createLocalReviewLog,
  parsePushItems
} from './companionDesktopSyncObjectsPushAckTestSupport';

const syncBridgeMock = vi.hoisted(() => ({
  applyCompanionDesktopSyncPack: vi.fn(async (): Promise<{
    applied_blob_count: number;
    applied_object_count: number;
    applied_review_op_ids?: string[];
    to_state_seq: number;
  }> => ({ applied_blob_count: 0, applied_object_count: 0, to_state_seq: 0 })),
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
  loadCompanionMissingAttachmentResources: vi.fn(async () => [] as Array<{ attachment_id: string; content_hash: string; size_bytes?: number }>),
  loadCompanionMissingContentBlobs: vi.fn(async () => [] as Array<{ hash: string; size_bytes?: number }>),
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
  stageCompanionSyncPushItems: vi.fn(async () => undefined),
  saveCompanionSyncStateCursor: vi.fn(async (cursor: number | null) => cursor),
  saveCompanionSyncStatePushCursor: vi.fn(async (cursor: number | null) => cursor),
  syncCompanionContentBlob: vi.fn(async ({ hash }: { hash: string }) => ({ availability: 'cached', hash }))
}));

const diagnosticsMock = vi.hoisted(() => ({
  loadDesktopSyncDiagnostics: vi.fn(async (): Promise<unknown> => null),
  loadLocalSyncDiagnostics: vi.fn(async (): Promise<unknown> => null)
}));

vi.mock('./companionSyncObjects', () => syncBridgeMock);
vi.mock('./companion/sync/syncGroupStore', () => ({
  loadCompanionSyncGroup: vi.fn(async () => null)
}));
vi.mock('./companion/sync/diagnostics/companionSyncDiagnostics', () => diagnosticsMock);
vi.mock('./companionDesktopAttachmentResources', () => ({
  syncCompanionAttachmentResourceRequestsFromDesktop: vi.fn(async () => [] as string[]),
  syncCompanionAttachmentResourcesFromDesktop: vi.fn(async () => [] as string[])
}));
vi.mock('./companionWorkspacePairing', () => ({
  createSignedRequestHeaders: vi.fn(async () => ({ 'X-Device-Id': 'android-test-device' })),
  loadCompanionPairingState: vi.fn(async () => ({ device_kind: 'android', remote_peer_id: 'desktop-peer' }))
}));

function setupPushAckMocks() {
  beforeEach(() => {
    vi.resetAllMocks();
    diagnosticsMock.loadLocalSyncDiagnostics.mockResolvedValue(null);
    diagnosticsMock.loadDesktopSyncDiagnostics.mockResolvedValue(null);
    syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([]);
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => ({
      json: async () => {
        if (init?.method === 'POST' && url.includes('/companion/sync-push')) {
          return {
            acks: parsePushItems(init).items.map((item, index) => ({
              client_op_id: item.clientOpId,
              identity: item.identity,
              state_seq: item.identity.objectType === 'review_log' ? undefined : 100 + index,
              status: 'accepted'
            }))
          };
        }
        return { nodes: [], objects: [], reviews: [] };
      },
      ok: true
    })));
  });
}

describe('companion desktop sync push acknowledgement conflicts', () => {
  setupPushAckMocks();

  it('reports rejected and conflicted push acknowledgements without storing them as pending acks', async () => {
    syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([
      createLocalNodeReadingChange(),
      createLocalNodeReviewChange()
    ]);
    vi.mocked(fetch).mockResolvedValueOnce(createRejectedAckResponse() as Response);
    const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');

    const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

    expect(result.pushConflictCount).toBe(1);
    expect(result.pushRejectedCount).toBe(1);
    expect(result.pushedObjectIds).toEqual([]);
    expect(syncBridgeMock.saveCompanionSyncPushAcks).toHaveBeenCalledWith('desktop-peer', [
      expect.objectContaining({ clientOpId: 'node_reading:node-1:9', status: 'conflict' }),
      expect.objectContaining({ clientOpId: 'node_review:node-1:10', status: 'rejected' })
    ]);
  });

  it('rejects accepted state-object acks that cannot be confirmed by a pulled state seq', async () => {
    syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([createLocalNodeReviewChange()]);
    vi.mocked(fetch).mockResolvedValueOnce({
      json: async () => ({
        acks: [{
          client_op_id: 'node_review:node-1:10',
          identity: { objectId: 'node-1', objectType: 'node_review', scope: 'workspace' },
          status: 'accepted'
        }]
      }),
      ok: true
    } as Response);
    const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');

    const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

    expect(result.pushedObjectIds).toEqual([]);
    expect(result.pushRejectedCount).toBe(1);
    expect(syncBridgeMock.saveCompanionSyncPushAcks).toHaveBeenCalledWith('desktop-peer', [
      expect.objectContaining({ clientOpId: 'node_review:node-1:10', conflictReason: 'missing_state_seq' })
    ]);
  });
});

describe('companion desktop sync create-attempt push acknowledgements', () => {
  setupPushAckMocks();

  it('pushes dirty state rows with a null base as create attempts', async () => {
    syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([createLocalNodeReadingChange({ base_content_hash: null })]);
    const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');

    const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

    expect(result.pushedObjectIds).toEqual(['node_reading:node-1']);
    expect(fetch).toHaveBeenCalledWith('http://10.0.2.2:38641/companion/sync-push', expect.objectContaining({
      body: expect.stringContaining('"baseContentHash":null'),
      method: 'POST'
    }));
  });

  it('pushes node_review dirty rows with a null base as create attempts', async () => {
    syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([{ ...createLocalNodeReviewChange(), base_content_hash: null }]);
    const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');

    const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

    expect(result.pushedObjectIds).toEqual(['node_review:node-1']);
    expect(fetch).toHaveBeenCalledWith('http://10.0.2.2:38641/companion/sync-push', expect.objectContaining({
      body: expect.stringContaining('"baseContentHash":null'),
      method: 'POST'
    }));
  });

  it('pushes review_log when the matching node_review is a create attempt', async () => {
    syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([{ ...createLocalNodeReviewChange(), base_content_hash: null }]);
    syncBridgeMock.loadCompanionSyncReviewLog.mockResolvedValue([createLocalReviewLog()]);
    const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');

    const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

    expect(result.pushedReviewOpIds).toEqual(['op-1']);
    expect(fetch).toHaveBeenCalledWith('http://10.0.2.2:38641/companion/sync-push', expect.any(Object));
    expect(syncBridgeMock.saveCompanionSyncReviewLogPushCursor).not.toHaveBeenCalled();
  });
});

function createRejectedAckResponse() {
  return {
    json: async () => ({
      acks: parsePushItems({
        body: JSON.stringify({
          items: [
            { clientOpId: 'node_reading:node-1:9', identity: { objectId: 'node-1', objectType: 'node_reading' } },
            { clientOpId: 'node_review:node-1:10', identity: { objectId: 'node-1', objectType: 'node_review' } }
          ]
        })
      }).items.map((item, index) => ({
        client_op_id: item.clientOpId,
        identity: item.identity,
        status: index === 0 ? 'conflict' : 'rejected'
      }))
    }),
    ok: true
  };
}
