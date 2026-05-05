import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  NativeSyncChangeCursor,
  NativeSyncIndexEntry,
  NativeSyncObjectRecord
} from '../../../lib/platform/nativeSyncContract';

const syncBridgeMock = vi.hoisted(() => ({
  applyCompanionSyncObjects: vi.fn(async (objects: NativeSyncObjectRecord[]) => (
    objects.map((object) => `${object.object_type}:${object.object_id}`)
  )),
  loadCompanionSyncChanges: vi.fn(async () => []),
  loadCompanionSyncChangeCursor: vi.fn(async (): Promise<NativeSyncChangeCursor | null> => null),
  loadCompanionSyncIndex: vi.fn(async (): Promise<NativeSyncIndexEntry[]> => []),
  loadCompanionSyncPushCursor: vi.fn(async (): Promise<NativeSyncChangeCursor | null> => null),
  saveCompanionSyncChangeCursor: vi.fn(async (cursor: NativeSyncChangeCursor | null) => cursor),
  saveCompanionSyncPushCursor: vi.fn(async (cursor: NativeSyncChangeCursor | null) => cursor)
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

function createObjectRecord(
  objectId: string,
  objectType: NativeSyncObjectRecord['object_type'],
  contentHash: string
): NativeSyncObjectRecord {
  return {
    content_hash: contentHash,
    deleted_at: null,
    object_id: objectId,
    object_type: objectType,
    payload_json: '{}',
    updated_at: '2026-04-25T00:00:00.000Z'
  };
}

function createFetchMock(remoteIndex: NativeSyncIndexEntry[], remoteObjects: NativeSyncObjectRecord[]) {
  return vi.fn(async (url: string) => ({
    json: async () => (
      url.includes('/companion/sync-changes')
        ? {
            changes: [{
              change_id: 'change-1',
              change_type: 'upsert',
              content_hash: 'new-hash',
              created_at: '2026-04-25T00:02:00.000Z',
              device_id: 'desktop',
              object_id: 'changed-setting',
              object_type: 'setting',
              payload_json: '{}'
            }]
          }
        : url.includes('/companion/sync-index')
          ? { entries: remoteIndex }
          : { objects: remoteObjects.filter((object) => url.includes(`object_type=${object.object_type}`)) }
    ),
    ok: true
  }));
}

function expectPullResult(result: unknown) {
  expect(result).toEqual({
    changedObjectIds: ['changed-setting'],
    appliedObjectIds: ['setting:changed-setting', 'pdf_page_text:pdf-1'],
    pushedObjectIds: [],
    requestedObjectIds: ['pdf-1']
  });
}

function expectPullFetches(fetchMock: ReturnType<typeof createFetchMock>) {
  expect(fetchMock).toHaveBeenCalledWith(
    'http://10.0.2.2:38641/companion/sync-changes?limit=500',
    expect.objectContaining({ headers: expect.objectContaining({ 'X-Device-Id': 'android-test-device' }) })
  );
  expect(fetchMock).toHaveBeenCalledWith(
    'http://10.0.2.2:38641/companion/sync-index',
    expect.objectContaining({ headers: expect.objectContaining({ 'X-Device-Id': 'android-test-device' }) })
  );
  expect(fetchMock).toHaveBeenCalledWith(
    expect.stringContaining('/companion/sync-objects?object_type=pdf_page_text&object_id=pdf-1'),
    expect.any(Object)
  );
}

function expectPullWrites(remoteObjects: NativeSyncObjectRecord[]) {
  expect(syncBridgeMock.applyCompanionSyncObjects).toHaveBeenCalledWith([
    expect.objectContaining({ object_id: 'changed-setting', object_type: 'setting' })
  ]);
  expect(syncBridgeMock.applyCompanionSyncObjects).toHaveBeenCalledWith(remoteObjects);
  expect(syncBridgeMock.saveCompanionSyncChangeCursor).toHaveBeenCalledWith({
    change_id: 'change-1',
    created_at: '2026-04-25T00:02:00.000Z'
  });
}

async function testPullsChangedObjects() {
  const remoteIndex = [
    createIndexEntry('same-setting', 'setting', 'same-hash'),
    createIndexEntry('changed-setting', 'setting', 'new-hash'),
    createIndexEntry('pdf-1', 'pdf_page_text', 'pdf-hash'),
    createIndexEntry('node-1', 'node', 'node-hash')
  ];
  const remoteObjects = [
    createObjectRecord('pdf-1', 'pdf_page_text', 'pdf-hash')
  ];
  const fetchMock = createFetchMock(remoteIndex, remoteObjects);
  vi.stubGlobal('fetch', fetchMock);

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expectPullResult(result);
  expectPullFetches(fetchMock);
  expectPullWrites(remoteObjects);
}

async function testPushesLocalChanges() {
  const localChange = {
    change_id: 'local-change-1',
    change_type: 'upsert' as const,
    content_hash: 'local-hash',
    created_at: '2026-04-25T00:01:00.000Z',
    device_id: 'android',
    object_id: 'mobile:android:phone:*:handoff',
    object_type: 'setting' as const,
    payload_json: '{"key":"handoff"}'
  };
  syncBridgeMock.loadCompanionSyncChanges.mockResolvedValue([localChange]);
  const fetchMock = createFetchMock([], []);
  vi.stubGlobal('fetch', fetchMock);

  const { syncCompanionObjectsFromDesktop } = await import('./companionDesktopSyncObjects');
  const result = await syncCompanionObjectsFromDesktop('http://10.0.2.2:38641/');

  expect(result.pushedObjectIds).toEqual(['mobile:android:phone:*:handoff']);
  expect(fetchMock).toHaveBeenCalledWith(
    'http://10.0.2.2:38641/companion/sync-objects',
    expect.objectContaining({ method: 'POST' })
  );
  expect(syncBridgeMock.saveCompanionSyncPushCursor).toHaveBeenCalledWith({
    change_id: 'local-change-1',
    created_at: '2026-04-25T00:01:00.000Z'
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
    syncBridgeMock.loadCompanionSyncChanges.mockResolvedValue([]);
    syncBridgeMock.loadCompanionSyncChangeCursor.mockResolvedValue(null);
    syncBridgeMock.loadCompanionSyncPushCursor.mockResolvedValue(null);
    syncBridgeMock.saveCompanionSyncChangeCursor.mockImplementation(async (cursor: NativeSyncChangeCursor | null) => cursor);
    syncBridgeMock.saveCompanionSyncPushCursor.mockImplementation(async (cursor: NativeSyncChangeCursor | null) => cursor);
    pairingMock.createSignedRequestHeaders.mockResolvedValue({
      'X-Device-Id': 'android-test-device',
      'X-Signature': 'signed'
    });
  });

  it('pulls changed generic objects from desktop and applies them locally', testPullsChangedObjects);

  it('pushes local companion changes to the paired desktop before pulling remote changes', testPushesLocalChanges);
});
