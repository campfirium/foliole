import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  NativeSyncChangeCursor,
  NativeSyncIndexEntry,
  NativeSyncNodeRecord,
  NativeSyncReviewLogRecord,
  NativeSyncStateObjectRecord
} from '../../../lib/platform/nativeSyncContract';

const syncBridgeMock = vi.hoisted(() => ({
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
  loadCompanionSyncStateCursor: vi.fn(async (): Promise<number | null> => null),
  loadCompanionSyncStatePushCursor: vi.fn(async (): Promise<number | null> => null),
  saveCompanionSyncNodeVersionCursor: vi.fn(async (cursor: NativeSyncChangeCursor | null) => cursor),
  saveCompanionSyncNodeVersionPushCursor: vi.fn(async (cursor: NativeSyncChangeCursor | null) => cursor),
  saveCompanionSyncReviewLogCursor: vi.fn(async (cursor: NativeSyncChangeCursor | null) => cursor),
  saveCompanionSyncReviewLogPushCursor: vi.fn(async (cursor: NativeSyncChangeCursor | null) => cursor),
  saveCompanionSyncStateCursor: vi.fn(async (cursor: number | null) => cursor),
  saveCompanionSyncStatePushCursor: vi.fn(async (cursor: number | null) => cursor)
}));

vi.mock('./companionSyncObjects', () => syncBridgeMock);
vi.mock('./companionWorkspacePairing', () => ({
  createSignedRequestHeaders: vi.fn(async () => ({ 'X-Device-Id': 'android-test-device' }))
}));

function createLocalStateChange(): NativeSyncStateObjectRecord {
  return {
    content_hash: 'local-hash',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_reading',
    payload_json: '{"reading_position":42}',
    state_seq: 9,
    updated_at: '2026-04-25T00:04:00.000Z'
  };
}

describe('companion desktop sync push acknowledgements', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([createLocalStateChange()]);
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => ({
      json: async () => init?.method === 'POST' && url.includes('/companion/sync-objects')
        ? { applied_object_ids: [] }
        : { nodes: [], objects: [], reviews: [] },
      ok: true
    })));
  });

  it('keeps the local push cursor when desktop rejects a state object', async () => {
    const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');

    const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

    expect(result.pushedObjectIds).toEqual([]);
    expect(syncBridgeMock.saveCompanionSyncStatePushCursor).not.toHaveBeenCalled();
  });
});
