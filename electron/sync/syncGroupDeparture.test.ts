import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  headers: vi.fn(() => ({ 'X-Signature': 'signed' })),
  loadDeviceId: vi.fn(() => 'device-a'),
  loadGroup: vi.fn(),
  loadPeers: vi.fn(),
  recordDeparture: vi.fn(),
  removeCredentials: vi.fn(),
  requestJson: vi.fn()
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
  createDesktopSyncGroupSignedHeaders: mocks.headers,
  requestJson: mocks.requestJson
}));

import { acceptSyncGroupDeparture, leaveDesktopSyncGroup } from './syncGroupDeparture.js';

const GROUP = {
  group_id: 'group-1', local_member_state: 'active',
  members: [{ device_id: 'device-a' }, { device_id: 'device-b' }]
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadGroup.mockReturnValue(GROUP);
  mocks.loadPeers.mockReturnValue([{
    endpoint_url: 'http://device-b', peer_device_id: 'device-b', secret: 'secret-b'
  }]);
  mocks.requestJson.mockResolvedValue({ status: 'accepted' });
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

it('rejects a departure attributed to another Device', () => {
  const payload = JSON.stringify({
    authorization_id: 'leave-b', authorized_by_device_id: 'device-a', device_id: 'device-b',
    group_id: 'group-1', left_at: '2026-08-09T02:00:00Z'
  });

  expect(() => acceptSyncGroupDeparture(payload, 'device-b'))
    .toThrow('sync_group_departure_authorization_invalid');
  expect(mocks.recordDeparture).not.toHaveBeenCalled();
});

it('delivers a self-authorized fact before locally unbinding the departing Device', async () => {
  await leaveDesktopSyncGroup();

  const sent = JSON.parse(mocks.requestJson.mock.calls[0]?.[1]?.body as string) as Record<string, unknown>;
  expect(sent).toMatchObject({ authorized_by_device_id: 'device-a', device_id: 'device-a', group_id: 'group-1' });
  expect(mocks.requestJson.mock.invocationCallOrder[0]!)
    .toBeLessThan(mocks.recordDeparture.mock.invocationCallOrder[0]!);
  expect(mocks.recordDeparture).toHaveBeenCalledWith(expect.objectContaining({ local: true }));
  expect(mocks.removeCredentials).toHaveBeenCalledWith('group-1', 'device-b');
});
