import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  headers: vi.fn(() => ({ 'X-Signature': 'signed' })),
  loadDeviceId: vi.fn(() => 'device-a'),
  loadGroup: vi.fn(),
  loadPeers: vi.fn(),
  recordDeparture: vi.fn(),
  removeCredentials: vi.fn(),
  post: vi.fn()
}));

vi.mock('../database/deviceIdentity.js', () => ({ loadOrCreateDesktopDeviceId: mocks.loadDeviceId }));
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
  group_id: 'group-1', local_device_id: 'device-a', local_member_state: 'active',
  members: [{ device_id: 'device-a', state: 'active' }, { device_id: 'device-b', state: 'active' }]
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadGroup.mockReturnValue(GROUP);
  mocks.loadPeers.mockReturnValue([{
    endpoint_url: 'http://device-b', peer_device_id: 'device-b'
  }]);
  mocks.post.mockResolvedValue({ status: 'accepted' });
});

it('accepts only a self-authorized departure from the authenticated Device', () => {
  const payload = JSON.stringify({
    authorization_id: 'leave-b', authorized_by_device_id: 'device-b', device_id: 'device-b',
    group_id: 'group-1', left_at: '2026-08-09T02:00:00Z'
  });

  expect(acceptSyncGroupDeparture(payload, 'device-b')).toEqual({ status: 'accepted' });
  expect(mocks.recordDeparture).toHaveBeenCalledWith(expect.objectContaining({
    authorizedByDeviceId: 'device-b', deviceId: 'device-b', groupId: 'group-1'
  }));
  expect(mocks.removeCredentials).toHaveBeenCalledWith('group-1', 'device-b');
});

it('accepts removal of another Device when attributed to the authenticated member', () => {
  const payload = JSON.stringify({
    authorization_id: 'leave-b', authorized_by_device_id: 'device-a', device_id: 'device-b',
    group_id: 'group-1', left_at: '2026-08-09T02:00:00Z'
  });

  expect(acceptSyncGroupDeparture(payload, 'device-a')).toEqual({ status: 'accepted' });
  expect(mocks.recordDeparture).toHaveBeenCalledWith(expect.objectContaining({
    authorizedByDeviceId: 'device-a', deviceId: 'device-b'
  }));
  expect(mocks.removeCredentials).toHaveBeenCalledWith('group-1', 'device-b');
});

it('records and revokes a remote member even when no peer is currently reachable', async () => {
  mocks.post.mockRejectedValue(new Error('offline'));
  await removeDesktopSyncGroupMember('device-b');
  expect(mocks.recordDeparture).toHaveBeenCalledWith(expect.objectContaining({
    authorizedByDeviceId: 'device-a', deviceId: 'device-b'
  }));
  expect(mocks.removeCredentials).toHaveBeenCalledWith('group-1', 'device-b');
});

it('delivers a self-authorized fact before locally unbinding the departing Device', async () => {
  await leaveDesktopSyncGroup();

  const sent = JSON.parse(mocks.post.mock.calls[0]?.[0]?.body as string) as Record<string, unknown>;
  expect(sent).toMatchObject({ authorized_by_device_id: 'device-a', device_id: 'device-a', group_id: 'group-1' });
  expect(mocks.post.mock.invocationCallOrder[0]!)
    .toBeLessThan(mocks.recordDeparture.mock.invocationCallOrder[0]!);
  expect(mocks.recordDeparture).toHaveBeenCalledWith(expect.objectContaining({ local: true }));
  expect(mocks.removeCredentials).toHaveBeenCalledWith('group-1', 'device-b');
});

it('lets the last active member Leave without a reachable peer', async () => {
  mocks.loadGroup.mockReturnValue({
    ...GROUP,
    members: [{ device_id: 'device-a', state: 'active' }, { device_id: 'device-b', state: 'left' }]
  });
  mocks.loadPeers.mockReturnValue([]);

  await leaveDesktopSyncGroup();

  expect(mocks.post).not.toHaveBeenCalled();
  expect(mocks.recordDeparture).toHaveBeenCalledWith(expect.objectContaining({
    deviceId: 'device-a', groupId: 'group-1', local: true
  }));
});
