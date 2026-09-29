import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  NativeSyncChangeCursor,
  NativeSyncNodeRecord,
  NativeSyncStateObjectRecord
} from '../../../lib/platform/nativeSyncContract';

const syncBridgeMock = vi.hoisted(() => ({
  loadCompanionSyncNodeVersionPushCursor: vi.fn(async (): Promise<NativeSyncChangeCursor | null> => null),
  loadCompanionSyncNodeVersions: vi.fn(async () => [] as NativeSyncNodeRecord[]),
  loadCompanionSyncReviewLog: vi.fn(async () => []),
  loadCompanionSyncReviewLogPushCursor: vi.fn(async () => null),
  loadCompanionSyncStateChanges: vi.fn(async (): Promise<NativeSyncStateObjectRecord[]> => []),
  loadCompanionSyncStatePushCursor: vi.fn(async () => null),
  saveCompanionSyncNodeVersionPushCursor: vi.fn(async (cursor: NativeSyncChangeCursor | null) => cursor),
  saveCompanionSyncPushAcks: vi.fn(async () => []),
  stageCompanionSyncPushItems: vi.fn(async () => undefined)
}));

const httpMock = vi.hoisted(() => ({
  postDesktopJson: vi.fn()
}));

vi.mock('./companionSyncObjects', () => syncBridgeMock);
vi.mock('./companionDesktopSyncHttp', () => httpMock);
vi.mock('./companion/sync/syncGroupStore', () => ({
  loadCompanionSyncGroup: vi.fn(async () => ({ group_id: 'group-test' }))
}));
vi.mock('./companion/network/syncGroupPeerIdentity', () => ({
  resolveCompanionSyncPeerId: vi.fn(async () => 'desktop-peer'),
  resolveCompanionSyncPeerHostName: vi.fn(async () => 'Desktop')
}));
vi.mock('./companionWorkspacePairing', () => ({
  loadCompanionPairingState: vi.fn(async () => ({ remote_peer_id: 'desktop-peer' }))
}));

function createNodeVersion(versionId: string): NativeSyncNodeRecord {
  return {
    ancestor_version_ids: [],
    content_hash: `${versionId}-hash`,
    host_name: 'android-device',
    object_id: `node-${versionId}`,
    object_type: 'node',
    parent_version_id: null,
    snapshot: {
      anchor_link: null,
      attachments: [],
      content: 'Selected text',
      created_at: '2026-05-03T01:00:00.000Z',
      deleted_at: null,
      desired_retention: null,
      hide_title_heading: false,
      id: `node-${versionId}`,
      image_regions: null,
      is_title_manual: false,
      kind: 'topic',
      opening_text: null,
      parent_id: 'parent',
      position: null,
      priority: null,
      reveal: null,
      title: 'Selected text',
      updated_at: '2026-05-03T01:00:00.000Z',
      virtual_filter: null
    },
    updated_at: '2026-05-03T01:00:00.000Z',
    version_created_at: `2026-05-03T01:00:0${versionId}.000Z`,
    version_id: `android#${versionId}`
  };
}

describe('companion desktop sync node version push', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('pushes node versions and advances the node version push cursor after accepted acks', async () => {
    const versions = [createNodeVersion('1'), createNodeVersion('2')];
    syncBridgeMock.loadCompanionSyncNodeVersions.mockResolvedValue(versions);
    httpMock.postDesktopJson.mockResolvedValue({
      acks: versions.map((version) => ({
        client_op_id: `node:${version.version_id}`,
        identity: { objectId: version.object_id, objectType: 'node', scope: 'workspace' },
        status: 'accepted',
        version_id: version.version_id
      }))
    });
    const { pushLocalDirtyObjects } = await import('./companionDesktopSyncPush');

    const result = await pushLocalDirtyObjects('http://desktop');

    expect(httpMock.postDesktopJson).toHaveBeenCalledWith('http://desktop', '/companion/sync-push', {
      items: [
        expect.objectContaining({ clientOpId: 'node:android#1' }),
        expect.objectContaining({ clientOpId: 'node:android#2' })
      ]
    });
    expect(result.pushedObjectIds).toEqual(['node:node-1', 'node:node-2']);
    expect(syncBridgeMock.stageCompanionSyncPushItems).toHaveBeenCalledWith('desktop-peer', expect.any(Array));
    expect(syncBridgeMock.saveCompanionSyncPushAcks).toHaveBeenCalledWith('desktop-peer', expect.any(Array));
  });

  it('sends parent order created by a canonical node receipt in the same sync pass', async () => {
    const version = createNodeVersion('1');
    syncBridgeMock.loadCompanionSyncNodeVersions.mockResolvedValueOnce([version]).mockResolvedValue([]);
    syncBridgeMock.loadCompanionSyncStateChanges.mockResolvedValueOnce([]).mockResolvedValue([{
      base_content_hash: 'original-order', content_hash: 'fork-order', deleted_at: null,
      last_modified_by_host_name: 'android-device', object_id: 'parent',
      object_type: 'parent_child_order',
      payload_json: '{"parent_id":"parent","child_ids_json":"[\\"node-android#1\\"]"}',
      state_seq: 7, updated_at: '2026-05-03T01:00:07.000Z'
    }]);
    httpMock.postDesktopJson.mockResolvedValueOnce({ acks: [{
      canonical_object_id: 'node-android#1~copy', canonical_version_id: 'copy#1',
      client_op_id: 'node:android#1',
      identity: { objectId: version.object_id, objectType: 'node', scope: 'workspace' },
      status: 'accepted', version_id: version.version_id
    }] }).mockResolvedValueOnce({ acks: [{
      client_op_id: 'parent_child_order:parent:7',
      identity: { objectId: 'parent', objectType: 'parent_child_order', scope: 'workspace' },
      state_seq: 8, status: 'accepted'
    }] });
    const { pushLocalDirtyObjects } = await import('./companionDesktopSyncPush');

    const result = await pushLocalDirtyObjects('http://desktop');

    expect(httpMock.postDesktopJson).toHaveBeenCalledTimes(2);
    expect(httpMock.postDesktopJson.mock.calls[1]?.[2]).toMatchObject({
      items: [expect.objectContaining({ clientOpId: 'parent_child_order:parent:7' })]
    });
    expect(result.pushedObjectIds).toEqual([
      'node:node-1', 'parent_child_order:parent'
    ]);
  });
});
