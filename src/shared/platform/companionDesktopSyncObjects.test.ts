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

const pairingMock = vi.hoisted(() => ({
  createSignedRequestHeaders: vi.fn(async ({ pathWithQuery }: { pathWithQuery: string }) => ({
    'X-Device-Id': 'android-test-device',
    'X-Signature': `signed:${pathWithQuery}`
  }))
}));

vi.mock('./companionSyncObjects', () => syncBridgeMock);
vi.mock('./companionWorkspacePairing', () => pairingMock);

function createIndexEntry(
  objectId: string,
  objectType: NativeSyncIndexEntry['object_type'],
  contentHash: string
): NativeSyncIndexEntry {
  return {
    content_hash: contentHash,
    object_id: objectId,
    object_type: objectType,
    sync_version_id: null,
    updated_at: '2026-04-25T00:00:00.000Z'
  };
}

function parseBody(init: RequestInit | undefined) {
  return JSON.parse(String(init?.body ?? '{}')) as {
    nodes?: NativeSyncNodeRecord[];
    objects?: NativeSyncObjectRecord[];
    reviews?: NativeSyncReviewLogRecord[];
  };
}

function createFetchMock(remoteIndex: NativeSyncIndexEntry[], remoteObjects: NativeSyncObjectRecord[]) {
  return vi.fn(async (url: string, init?: RequestInit) => ({
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
      return url.includes('/companion/sync-state')
        ? {
            objects: [{
              content_hash: 'new-hash',
              deleted_at: null,
              object_id: 'changed-setting',
              object_type: 'setting',
              payload_json: '{}',
              state_seq: 1,
              updated_at: '2026-04-25T00:02:00.000Z'
            }]
          }
        : url.includes('/companion/sync-node-versions')
          ? { nodes: [] }
          : url.includes('/companion/sync-review-log')
            ? { reviews: [] }
        : url.includes('/companion/sync-index')
          ? { entries: remoteIndex }
          : { objects: remoteObjects.filter((object) => url.includes(`object_type=${object.object_type}`)) };
    },
    ok: true
  }));
}

function expectPullResult(result: unknown) {
  expect(result).toEqual({
    appliedNodeIds: [],
    changedObjectIds: ['changed-setting'],
    appliedObjectIds: ['setting:changed-setting'],
    appliedReviewOpIds: [],
    pushedNodeIds: [],
    pushedObjectIds: [],
    pushedReviewOpIds: [],
    requestedObjectIds: []
  });
}

function expectPullFetches(fetchMock: ReturnType<typeof createFetchMock>) {
  expect(fetchMock).toHaveBeenCalledWith(
    'http://10.0.2.2:38641/companion/sync-state?limit=500&after_state_seq=0',
    expect.objectContaining({ headers: expect.objectContaining({ 'X-Device-Id': 'android-test-device' }) })
  );
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/companion/sync-index'), expect.any(Object));
  expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/companion/sync-objects?'), expect.any(Object));
}

function expectPullWrites() {
  expect(syncBridgeMock.applyCompanionSyncObjects).toHaveBeenCalledWith([
    expect.objectContaining({ object_id: 'changed-setting', object_type: 'setting' })
  ]);
  expect(syncBridgeMock.saveCompanionSyncStateCursor).toHaveBeenCalledWith(1);
}

async function testPullsChangedObjects() {
  const remoteIndex = [
    createIndexEntry('same-setting', 'setting', 'same-hash'),
    createIndexEntry('changed-setting', 'setting', 'new-hash'),
    createIndexEntry('pdf-1', 'pdf_page_text', 'pdf-hash'),
    createIndexEntry('node-1', 'node', 'node-hash')
  ];
  const fetchMock = createFetchMock(remoteIndex, []);
  vi.stubGlobal('fetch', fetchMock);

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expectPullResult(result);
  expectPullFetches(fetchMock);
  expectPullWrites();
}

async function testPushesLocalChanges() {
  const localChange = {
    content_hash: 'local-hash',
    deleted_at: null,
    object_id: 'mobile:android:phone:*:handoff',
    object_type: 'setting' as const,
    payload_json: '{"key":"handoff"}',
    state_seq: 2,
    updated_at: '2026-04-25T00:01:00.000Z'
  };
  const localReview = createReviewRecord();
  syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([localChange]);
  syncBridgeMock.loadCompanionSyncReviewLog.mockResolvedValue([localReview]);
  const fetchMock = createFetchMock([], []);
  vi.stubGlobal('fetch', fetchMock);

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result.pushedObjectIds).toEqual(['mobile:android:phone:*:handoff']);
  expect(result.pushedReviewOpIds).toEqual(['op-1']);
  expect(fetchMock).toHaveBeenNthCalledWith(1,
    'http://10.0.2.2:38641/companion/sync-objects',
    expect.objectContaining({ method: 'POST' })
  );
  expect(fetchMock).toHaveBeenNthCalledWith(2,
    'http://10.0.2.2:38641/companion/sync-review-log',
    expect.objectContaining({ method: 'POST' })
  );
  expect(syncBridgeMock.saveCompanionSyncStatePushCursor).toHaveBeenCalledWith(2);
  expect(syncBridgeMock.saveCompanionSyncReviewLogPushCursor).toHaveBeenCalledWith({
    change_id: 'op-1',
    created_at: '2026-04-25T00:04:00.000Z'
  });
}

async function testPushesNodeVersionsBeforeDependentState() {
  const localNode = createNodeRecord();
  const localReading = {
    content_hash: 'reading-hash',
    deleted_at: null,
    object_id: 'node-1',
    object_type: 'node_reading' as const,
    payload_json: '{"reading_position":42}',
    state_seq: 2,
    updated_at: '2026-04-25T00:04:00.000Z'
  };
  syncBridgeMock.loadCompanionSyncNodeVersions.mockResolvedValue([localNode]);
  syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([localReading]);
  const fetchMock = createFetchMock([], []);
  vi.stubGlobal('fetch', fetchMock);

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(fetchMock).toHaveBeenNthCalledWith(1,
    'http://10.0.2.2:38641/companion/sync-node-versions',
    expect.objectContaining({ method: 'POST' })
  );
  expect(fetchMock).toHaveBeenNthCalledWith(2,
    'http://10.0.2.2:38641/companion/sync-objects',
    expect.objectContaining({ method: 'POST' })
  );
}

async function testPullsNodeVersionsAndReviewLog() {
  const node = createNodeRecord();
  const review = createReviewRecord();
  const fetchMock = vi.fn(async (url: string) => ({
    json: async () => {
      if (url.includes('/companion/sync-node-versions')) return { nodes: [node] };
      if (url.includes('/companion/sync-review-log')) return { reviews: [review] };
      if (url.includes('/companion/sync-state')) return { objects: [] };
      return { objects: [] };
    },
    ok: true
  }));
  vi.stubGlobal('fetch', fetchMock);

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result.appliedNodeIds).toEqual(['node-1']);
  expect(result.appliedReviewOpIds).toEqual(['op-1']);
  expect(syncBridgeMock.saveCompanionSyncNodeVersionCursor).toHaveBeenCalledWith({
    change_id: 'version-1',
    created_at: '2026-04-25T00:03:00.000Z'
  });
  expect(syncBridgeMock.saveCompanionSyncReviewLogCursor).toHaveBeenCalledWith({
    change_id: 'op-1',
    created_at: '2026-04-25T00:04:00.000Z'
  });
}

describe('companion desktop sync objects', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    syncBridgeMock.applyCompanionSyncObjects.mockImplementation(async (objects: NativeSyncObjectRecord[]) => (
      objects.map((object) => `${object.object_type}:${object.object_id}`)
    ));
    syncBridgeMock.loadCompanionSyncIndex.mockResolvedValue([
      createIndexEntry('same-setting', 'setting', 'same-hash'),
      createIndexEntry('changed-setting', 'setting', 'new-hash')
    ]);
    syncBridgeMock.loadCompanionSyncNodeVersionCursor.mockResolvedValue(null);
    syncBridgeMock.loadCompanionSyncNodeVersionPushCursor.mockResolvedValue(null);
    syncBridgeMock.loadCompanionSyncNodeVersions.mockResolvedValue([]);
    syncBridgeMock.loadCompanionSyncReviewLogCursor.mockResolvedValue(null);
    syncBridgeMock.loadCompanionSyncReviewLogPushCursor.mockResolvedValue(null);
    syncBridgeMock.loadCompanionSyncReviewLog.mockResolvedValue([]);
    syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValue([]);
    syncBridgeMock.loadCompanionSyncStateCursor.mockResolvedValue(null);
    syncBridgeMock.loadCompanionSyncStatePushCursor.mockResolvedValue(null);
    syncBridgeMock.saveCompanionSyncNodeVersionCursor.mockImplementation(async (cursor: NativeSyncChangeCursor | null) => cursor);
    syncBridgeMock.saveCompanionSyncNodeVersionPushCursor.mockImplementation(async (cursor: NativeSyncChangeCursor | null) => cursor);
    syncBridgeMock.saveCompanionSyncReviewLogCursor.mockImplementation(async (cursor: NativeSyncChangeCursor | null) => cursor);
    syncBridgeMock.saveCompanionSyncReviewLogPushCursor.mockImplementation(async (cursor: NativeSyncChangeCursor | null) => cursor);
    syncBridgeMock.saveCompanionSyncStateCursor.mockImplementation(async (cursor: number | null) => cursor);
    syncBridgeMock.saveCompanionSyncStatePushCursor.mockImplementation(async (cursor: number | null) => cursor);
    pairingMock.createSignedRequestHeaders.mockResolvedValue({
      'X-Device-Id': 'android-test-device',
      'X-Signature': 'signed'
    });
  });

  it('pulls changed generic objects from desktop and applies them locally', testPullsChangedObjects);

  it('pulls node versions and review log from their dedicated streams', testPullsNodeVersionsAndReviewLog);

  it('pushes local companion changes to the paired desktop before pulling remote changes', testPushesLocalChanges);

  it('pushes node versions before node-scoped state rows', testPushesNodeVersionsBeforeDependentState);
});
