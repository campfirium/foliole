import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  headers: vi.fn(() => ({ 'X-Signature': 'signed' })),
  loadHostName: vi.fn(() => 'Host A'),
  loadDeviceId: vi.fn(() => 'device-a'),
  loadGroup: vi.fn(),
  loadPeers: vi.fn(),
  recordDeparture: vi.fn(),
  removeCredentials: vi.fn(),
  post: vi.fn()
}));

vi.mock('../database/deviceIdentity.js', () => ({ loadOrCreateDesktopDeviceId: mocks.loadDeviceId }));
vi.mock('../database/hostProfile.js', () => ({ loadOrCreateDesktopHostName: mocks.loadHostName }));
vi.mock('../database/syncGroupStore.js', () => ({
  loadDesktopSyncGroup: mocks.loadGroup,
  recordSyncGroupDeparture: mocks.recordDeparture
}));
vi.mock('./companionPairingStore.js', () => ({
  loadPairedSyncGroupPeers: mocks.loadPeers,
  removeSyncGroupPeerCredentials: mocks.removeCredentials
}));
vi.mock('./desktopSyncGroupHttp.js', () => ({
  postDesktopWorkgroupJson: mocks.post
}));
vi.mock('./workgroupKeyStore.js', () => ({
  loadDesktopWorkgroupKey: () => ({ group_key: 'group-key' }),
  removeDesktopWorkgroupKey: vi.fn()
}));

import { acceptSyncGroupDeparture, leaveDesktopSyncGroup, removeDesktopSyncGroupMember } from './syncGroupDeparture.js';

const GROUP = {
  group_id: 'group-1', local_host_name: 'Host A', local_member_state: 'active',
  members: [{ host_name: 'Host A', state: 'active' }, { host_name: 'Host B', state: 'active' },
    { host_name: 'Host C', state: 'active' }]
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadGroup.mockReturnValue(GROUP);
  mocks.loadPeers.mockReturnValue([{
    endpoint_url: 'http://device-b', local_device_id: 'device-a',
    peer_device_id: 'device-b', peer_host_name: 'Host B'
  }, {
    endpoint_url: 'http://device-c', local_device_id: 'device-a',
    peer_device_id: 'device-c', peer_host_name: 'Host C'
  }]);
  mocks.post.mockResolvedValue({ status: 'accepted' });
});

it('accepts only a self-authorized departure from the authenticated Device', () => {
  const payload = JSON.stringify({
    authorization_id: 'leave-b', authorized_by_host_name: 'Host B', host_name: 'Host B',
    group_id: 'group-1', left_at: '2026-08-09T02:00:00Z'
  });

  expect(acceptSyncGroupDeparture(payload, 'device-b')).toEqual({ status: 'accepted' });
  expect(mocks.recordDeparture).toHaveBeenCalledWith(expect.objectContaining({
    authorizedByHostName: 'Host B', hostName: 'Host B', groupId: 'group-1'
  }));
  expect(mocks.removeCredentials).toHaveBeenCalledWith('group-1', 'device-b');
});

it('accepts removal of another Device when attributed to the authenticated member', () => {
  const payload = JSON.stringify({
    authorization_id: 'leave-c', authorized_by_host_name: 'Host B', host_name: 'Host C',
    group_id: 'group-1', left_at: '2026-08-09T02:00:00Z'
  });

  expect(acceptSyncGroupDeparture(payload, 'device-b')).toEqual({ status: 'accepted' });
  expect(mocks.recordDeparture).toHaveBeenCalledWith(expect.objectContaining({
    authorizedByHostName: 'Host B', hostName: 'Host C'
  }));
  expect(mocks.removeCredentials).toHaveBeenCalledWith('group-1', 'device-c');
});

it('records and revokes a remote member even when no peer is currently reachable', async () => {
  mocks.post.mockRejectedValue(new Error('offline'));
  await removeDesktopSyncGroupMember('Host B');
  expect(mocks.recordDeparture).toHaveBeenCalledWith(expect.objectContaining({
    authorizedByHostName: 'Host A', hostName: 'Host B'
  }));
  expect(mocks.removeCredentials).toHaveBeenCalledWith('group-1', 'device-b');
});

it('delivers a self-authorized fact before locally unbinding the departing Device', async () => {
  await leaveDesktopSyncGroup();

  const sent = JSON.parse(mocks.post.mock.calls[0]?.[0]?.body as string) as Record<string, unknown>;
  expect(sent).toMatchObject({ authorized_by_host_name: 'Host A', host_name: 'Host A', group_id: 'group-1' });
  expect(mocks.post.mock.invocationCallOrder[0]!)
    .toBeLessThan(mocks.recordDeparture.mock.invocationCallOrder[0]!);
  expect(mocks.recordDeparture).toHaveBeenCalledWith(expect.objectContaining({ local: true }));
  expect(mocks.removeCredentials).toHaveBeenCalledWith('group-1', 'device-b');
});

it('lets the last active member Leave without a reachable peer', async () => {
  mocks.loadGroup.mockReturnValue({
    ...GROUP,
    members: [{ host_name: 'Host A', state: 'active' }, { host_name: 'Host B', state: 'left' },
      { host_name: 'Host C', state: 'left' }]
  });
  mocks.loadPeers.mockReturnValue([]);

  await leaveDesktopSyncGroup();

  expect(mocks.post).not.toHaveBeenCalled();
  expect(mocks.recordDeparture).toHaveBeenCalledWith(expect.objectContaining({
    hostName: 'Host A', groupId: 'group-1', local: true
  }));
});
