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
  saveCompanionSyncStateCursor: vi.fn(async (cursor: number | null) => cursor),
  saveCompanionSyncStatePushCursor: vi.fn(async (cursor: number | null) => cursor),
  syncCompanionContentBlob: vi.fn(async ({ hash }: { hash: string }) => ({ availability: 'cached', hash }))
}));

const diagnosticsMock = vi.hoisted(() => ({
  loadDesktopSyncDiagnostics: vi.fn(async () => null),
  loadLocalSyncDiagnostics: vi.fn(async () => null)
}));

vi.mock('./companionSyncObjects', () => syncBridgeMock);
vi.mock('./companionSyncDiagnostics', () => diagnosticsMock);
vi.mock('./companionDesktopAttachmentResources', () => ({
  syncCompanionAttachmentResourceRequestsFromDesktop: vi.fn(async () => [] as string[]),
  syncCompanionAttachmentResourcesFromDesktop: vi.fn(async () => [] as string[])
}));
vi.mock('./companionWorkspacePairing', () => ({
  createSignedRequestHeaders: vi.fn(async () => ({ 'X-Device-Id': 'android-test-device' }))
}));

function createLocalNodeReadingChange(overrides: Partial<NativeSyncStateObjectRecord> = {}): NativeSyncStateObjectRecord {
  return {
    base_content_hash: 'desktop-reading-base',
    content_hash: 'local-hash',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_reading',
    payload_json: '{"reading_position":42}',
    state_seq: 9,
    updated_at: '2026-04-25T00:04:00.000Z',
    ...overrides
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

function createLocalSettingChange(): NativeSyncStateObjectRecord {
  return {
    base_content_hash: 'desktop-setting-base',
    content_hash: 'local-setting-hash',
    deleted_at: null,
    object_id: 'device:android:phone:*:app_settings',
    object_type: 'setting',
    payload_json: '{"key":"app_settings","scope":"device","platform":"android","form_factor":"phone","device_id":"*","value_json":"{}"}',
    state_seq: 11,
    updated_at: '2026-04-25T00:06:00.000Z'
  };
}

function createLocalViewStateChange(): NativeSyncStateObjectRecord {
  return {
    base_content_hash: 'desktop-view-base',
    content_hash: 'local-view-hash',
    deleted_at: null,
    object_id: 'session_resume:android:phone:android-test-device:active_node',
    object_type: 'view_state',
    payload_json: '{"active_node_id":"node-1"}',
    state_seq: 12,
    updated_at: '2026-04-25T00:07:00.000Z'
  };
}

function createLocalReviewLog(overrides: Partial<NativeSyncReviewLogRecord> = {}): NativeSyncReviewLogRecord {
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
    stability_before: 3,
    ...overrides
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
    expect(syncBridgeMock.saveCompanionSyncPushAcks).toHaveBeenCalledWith([
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

  it('advances accepted review log cursor only after the pulled pack confirms the op id', async () => {
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
    expect(syncBridgeMock.saveCompanionSyncReviewLogPushCursor).toHaveBeenCalledWith({
      change_id: 'op-1',
      created_at: '2026-04-25T00:05:00.000Z'
    });
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

  it('reports rejected and conflicted push acknowledgements without storing them as pending acks', async () => {
    syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([
      createLocalNodeReadingChange(),
      createLocalNodeReviewChange()
    ]);
    vi.mocked(fetch).mockResolvedValueOnce({
      json: async () => ({
        acks: parsePushItems({
          body: JSON.stringify({
            items: [
              {
                clientOpId: 'node_reading:node-1:9',
                identity: { objectId: 'node-1', objectType: 'node_reading', scope: 'workspace' }
              },
              {
                clientOpId: 'node_review:node-1:10',
                identity: { objectId: 'node-1', objectType: 'node_review', scope: 'workspace' }
              }
            ]
          })
        }).items.map((item, index) => ({
          client_op_id: item.clientOpId,
          identity: item.identity,
          status: index === 0 ? 'conflict' : 'rejected'
        }))
      }),
      ok: true
    } as Response);
    const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');

    const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

    expect(result.pushConflictCount).toBe(1);
    expect(result.pushRejectedCount).toBe(1);
    expect(result.pushedObjectIds).toEqual([]);
    expect(syncBridgeMock.saveCompanionSyncPushAcks).toHaveBeenCalledWith([
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
    expect(syncBridgeMock.saveCompanionSyncPushAcks).toHaveBeenCalledWith([
      expect.objectContaining({
        clientOpId: 'node_review:node-1:10',
        conflictReason: 'missing_state_seq',
        status: 'rejected'
      })
    ]);
  });

  it('skips legacy node_reading dirty rows that do not have a base reference', async () => {
    syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([createLocalNodeReadingChange({
      base_content_hash: null
    })]);
    const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');

    const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

    expect(result.pushedObjectIds).toEqual([]);
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/companion/sync-push'), expect.any(Object));
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

  it('does not push review_log when the matching node_review state is not pushable', async () => {
    syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([{
      ...createLocalNodeReviewChange(),
      base_content_hash: null
    }]);
    syncBridgeMock.loadCompanionSyncReviewLog.mockResolvedValue([createLocalReviewLog()]);
    const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');

    const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

    expect(result.pushedReviewOpIds).toEqual([]);
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/companion/sync-push'), expect.any(Object));
    expect(syncBridgeMock.saveCompanionSyncReviewLogPushCursor).not.toHaveBeenCalled();
  });
});
