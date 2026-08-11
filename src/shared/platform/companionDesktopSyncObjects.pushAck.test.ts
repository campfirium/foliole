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
  createLocalSettingChange,
  createLocalViewStateChange,
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

describe('companion desktop sync push acknowledgements', () => {
  setupPushAckMocks();

  it('returns persisted push issue count from the final local diagnostics', async () => {
    diagnosticsMock.loadLocalSyncDiagnostics.mockResolvedValue({
      content: {
        missing_attachment_resource_bytes: 0,
        missing_attachment_resource_count: 0,
        missing_content_blob_bytes: 0,
        missing_content_blob_count: 0
      },
      sync_state: {
        local_dirty_count: 0,
        pending_ack_count: 0,
        push_issue_count: 1
      }
    } as Awaited<ReturnType<typeof diagnosticsMock.loadLocalSyncDiagnostics>>);
    const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');

    const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

    expect(result.pushIssueCount).toBe(1);
  });

  it('does not push unsupported state dirty through the new push endpoint', async () => {
    syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([{
      ...createLocalNodeReadingChange(),
      object_type: 'attachment'
    }]);
    const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');

    const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

    expect(result.pushedObjectIds).toEqual([]);
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/companion/sync-push'), expect.any(Object));
    expect(syncBridgeMock.saveCompanionSyncStatePushCursor).not.toHaveBeenCalled();
  });
});

describe('companion desktop sync accepted push acknowledgements', () => {
  setupPushAckMocks();

  it('pushes state objects and review_log, storing state acks without advancing review log cursor from ack alone', async () => {
    syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([
      createLocalNodeReadingChange(),
      createLocalNodeReviewChange(),
      createLocalSettingChange(),
      createLocalViewStateChange()
    ]);
    syncBridgeMock.loadCompanionSyncReviewLog.mockResolvedValue([createLocalReviewLog()]);
    const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');

    const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

    expect(fetch).toHaveBeenCalledWith('http://10.0.2.2:38641/companion/sync-push', expect.objectContaining({
      body: expect.stringContaining('"baseContentHash":"desktop-base"'),
      method: 'POST'
    }));
    expect(result.pushedObjectIds).toEqual([
      'node_reading:node-1',
      'node_review:node-1',
      'setting:device:android:phone:*:app_settings',
      'view_state:session_resume:android:phone:android-test-device:active_node'
    ]);
    expect(result.pushedReviewOpIds).toEqual(['op-1']);
    expect(syncBridgeMock.saveCompanionSyncPushAcks).toHaveBeenCalledWith('desktop-peer', [
      expect.objectContaining({ clientOpId: 'node_reading:node-1:9', status: 'accepted' }),
      expect.objectContaining({ clientOpId: 'node_review:node-1:10', status: 'accepted' }),
      expect.objectContaining({ clientOpId: 'setting:device:android:phone:*:app_settings:11', status: 'accepted' }),
      expect.objectContaining({
        clientOpId: 'view_state:session_resume:android:phone:android-test-device:active_node:12',
        status: 'accepted'
      }),
      expect.objectContaining({ clientOpId: 'review_log:op-1', status: 'accepted' })
    ]);
    expect(syncBridgeMock.saveCompanionSyncStatePushCursor).not.toHaveBeenCalled();
    expect(syncBridgeMock.saveCompanionSyncReviewLogPushCursor).not.toHaveBeenCalled();
  });

  it('does not push review_log when its node_review is not ready to push', async () => {
    syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([]);
    syncBridgeMock.loadCompanionSyncReviewLog.mockResolvedValue([createLocalReviewLog()]);
    const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');

    const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

    expect(result.pushedReviewOpIds).toEqual([]);
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/companion/sync-push'), expect.any(Object));
    expect(syncBridgeMock.saveCompanionSyncReviewLogPushCursor).not.toHaveBeenCalled();
  });
});

describe('companion desktop sync push acknowledgement cursors', () => {
  setupPushAckMocks();

  it('reports pulled review confirmation without reviving the legacy push cursor', async () => {
    syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([createLocalNodeReviewChange()]);
    syncBridgeMock.loadCompanionSyncReviewLog.mockResolvedValue([createLocalReviewLog()]);
    syncBridgeMock.applyCompanionDesktopSyncPack.mockResolvedValue({
      applied_blob_count: 0,
      applied_object_count: 1,
      applied_review_op_ids: ['op-1'],
      to_state_seq: 10
    });
    const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');

    const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

    expect(result.appliedReviewOpIds).toEqual(['op-1']);
    expect(syncBridgeMock.saveCompanionSyncReviewLogPushCursor).not.toHaveBeenCalled();
  });

  it('does not advance the review log cursor past earlier unconfirmed ops', async () => {
    syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([createLocalNodeReviewChange()]);
    syncBridgeMock.loadCompanionSyncReviewLog.mockResolvedValue([
      createLocalReviewLog({ op_id: 'op-1', reviewed_at: '2026-04-25T00:05:00.000Z' }),
      createLocalReviewLog({ id: 'review-op-2', op_id: 'op-2', reviewed_at: '2026-04-25T00:06:00.000Z' })
    ]);
    syncBridgeMock.applyCompanionDesktopSyncPack.mockResolvedValue({
      applied_blob_count: 0,
      applied_object_count: 1,
      applied_review_op_ids: ['op-2'],
      to_state_seq: 10
    });
    const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');

    const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

    expect(result.appliedReviewOpIds).toEqual(['op-2']);
    expect(syncBridgeMock.saveCompanionSyncReviewLogPushCursor).not.toHaveBeenCalled();
  });

  it('surfaces push failures while still applying the structure pack', async () => {
    syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([createLocalNodeReviewChange()]);
    vi.mocked(fetch).mockResolvedValueOnce({
      json: async () => ({}),
      ok: false,
      status: 500,
      text: async () => 'push rejected'
    } as Response);
    const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');

    const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

    expect(result.pushError).toBe('Desktop sync target returned 500 for /companion/sync-push.');
    expect(result.pushedObjectIds).toEqual([]);
    expect(syncBridgeMock.applyCompanionDesktopSyncPack).toHaveBeenCalled();
  });
});
