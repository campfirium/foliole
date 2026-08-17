// @vitest-environment node

import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  post: vi.fn(async () => ({ applied_state_seq: 17, status: 'ok' })),
  workgroupKey: 'a'.repeat(43)
}));

vi.mock('./desktopSyncGroupHttp.js', () => ({ postDesktopWorkgroupJson: runtime.post }));
vi.mock('./workgroupKeyStore.js', () => ({
  loadDesktopWorkgroupKey: () => ({ group_id: 'group-1', group_key: runtime.workgroupKey })
}));

import {
  acknowledgeDesktopSyncPack,
  postDesktopSyncPackAck,
  SYNC_PACK_ACK_PATH
} from './desktopSyncPackAck.js';

beforeEach(() => { vi.clearAllMocks(); });

it('confirms the authenticated peer frontier from a valid payload', () => {
  expect(acknowledgeDesktopSyncPack('{"applied_state_seq":17}', 'desktop-b')).toEqual({
    applied_state_seq: 17,
    status: 'ok'
  });
  expect(() => acknowledgeDesktopSyncPack('{"applied_state_seq":-1}', 'desktop-b'))
    .toThrow('sync_pack_ack_payload_invalid');
});

it('posts the persisted cursor through the existing workgroup-authenticated boundary', async () => {
  const peer = {
    endpoint_url: 'http://desktop-a:38641', group_id: 'group-1', local_device_id: 'desktop-b',
    peer_device_id: 'desktop-a', peer_device_kind: 'darwin', peer_device_name: 'Mac', timeline_id: 'timeline-1'
  };
  await expect(postDesktopSyncPackAck({ appliedStateSeq: 17, peer })).resolves.toMatchObject({ status: 'ok' });
  expect(runtime.post).toHaveBeenCalledWith({
    body: '{"applied_state_seq":17}', endpointUrl: peer.endpoint_url, groupId: peer.group_id,
    localDeviceId: peer.local_device_id, pathWithQuery: SYNC_PACK_ACK_PATH, secret: runtime.workgroupKey
  });
});
