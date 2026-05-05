import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  NativeSyncChangeCursor,
  NativeSyncIndexEntry,
  NativeSyncNodeRecord,
  NativeSyncObjectRecord,
  NativeSyncReviewLogRecord,
  NativeSyncStateObjectRecord
} from '../../../lib/platform/nativeSyncContract';

import {
  createNodeRecord,
  createReviewRecord
} from './companionDesktopSyncObjects.testFixtures';

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
  saveCompanionSyncStatePushCursor: vi.fn(async (cursor: number | null) => cursor)
}));

vi.mock('./companionSyncObjects', () => syncBridgeMock);
vi.mock('./companionDesktopAttachmentResources', () => ({
  syncCompanionAttachmentResourcesFromDesktop: vi.fn(async () => [] as string[])
}));
vi.mock('./companionWorkspacePairing', () => ({
  createSignedRequestHeaders: vi.fn(async () => ({ 'X-Device-Id': 'android-test-device' }))
}));

function parseBody(init: RequestInit | undefined) {
  return JSON.parse(String(init?.body ?? '{}')) as {
    nodes?: NativeSyncNodeRecord[];
    objects?: NativeSyncObjectRecord[];
    reviews?: NativeSyncReviewLogRecord[];
  };
}

function stubDesktopAcceptsAllStreams() {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => ({
    json: async () => {
      if (init?.method === 'POST' && url.includes('/companion/sync-node-versions')) {
        return { applied_node_ids: (parseBody(init).nodes ?? []).map((node) => node.object_id) };
      }
      if (init?.method === 'POST' && url.includes('/companion/sync-objects')) {
        return { applied_object_ids: (parseBody(init).objects ?? []).map((object) => `${object.object_type}:${object.object_id}`) };
      }
      if (init?.method === 'POST' && url.includes('/companion/sync-review-log')) {
        return { applied_op_ids: (parseBody(init).reviews ?? []).map((review) => review.op_id) };
      }
      return url.includes('/companion/sync-node-versions')
        ? { nodes: [] }
        : url.includes('/companion/sync-review-log')
          ? { reviews: [] }
          : { objects: [] };
    },
    ok: true
  })));
}

function createLocalStateChange(): NativeSyncStateObjectRecord {
  return {
    content_hash: 'reading-hash',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_reading',
    payload_json: '{"reading_position":42}',
    state_seq: 7,
    updated_at: '2026-04-25T00:04:00.000Z'
  };
}

describe('companion desktop sync all local streams', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    syncBridgeMock.loadCompanionSyncNodeVersions.mockResolvedValue([createNodeRecord()]);
    syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([createLocalStateChange()]);
    syncBridgeMock.loadCompanionSyncReviewLog.mockResolvedValue([createReviewRecord()]);
    stubDesktopAcceptsAllStreams();
  });

  it('advances every push cursor after desktop accepts node, state, and review streams', async () => {
    const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
    const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

    expect(result.pushedNodeIds).toEqual(['node-1']);
    expect(result.pushedObjectIds).toEqual(['node-1']);
    expect(result.pushedReviewOpIds).toEqual(['op-1']);
    expect(syncBridgeMock.saveCompanionSyncNodeVersionPushCursor).toHaveBeenCalledWith({
      change_id: 'version-1',
      created_at: '2026-04-25T00:03:00.000Z'
    });
    expect(syncBridgeMock.saveCompanionSyncStatePushCursor).toHaveBeenCalledWith(7);
    expect(syncBridgeMock.saveCompanionSyncReviewLogPushCursor).toHaveBeenCalledWith({
      change_id: 'op-1',
      created_at: '2026-04-25T00:04:00.000Z'
    });
  });
});
