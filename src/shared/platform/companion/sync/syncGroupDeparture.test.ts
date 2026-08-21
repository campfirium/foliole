import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bind: vi.fn(), clear: vi.fn(), clearPairing: vi.fn(), endpoint: vi.fn(), group: vi.fn(),
  headers: vi.fn(), prepare: vi.fn(), record: vi.fn(), request: vi.fn(), resolveTargets: vi.fn(),
  stop: vi.fn(), uuid: vi.fn(() => 'departure-1')
}));

vi.mock('../../companionWorkspacePairing', () => ({ createSignedRequestHeaders: mocks.headers }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: {
    clearPairingCredentials: mocks.clearPairing,
    clearSyncGroupCredentials: mocks.clear,
    desktopHttpRequest: mocks.request,
    stopSyncGroupProvider: mocks.stop
  },
  isNativeAndroidCompanionRuntime: () => true
}));
vi.mock('../../companionUuid', () => ({ createCompanionUuid: mocks.uuid }));
vi.mock('../network/companionWorkspaceEndpoint', () => ({
  bindCompanionWorkspaceSyncTarget: mocks.bind,
  resolveReachableCompanionWorkspaceSyncEndpoints: mocks.resolveTargets
}));
vi.mock('../network/signedRequest', () => ({
  prepareNativeCompanionWorkgroupRequest: mocks.prepare
}));
vi.mock('./syncGroupStore', () => ({
  loadCompanionSyncGroup: mocks.group,
  loadCompanionSyncGroupEndpoint: mocks.endpoint,
  recordLocalCompanionSyncGroupDeparture: mocks.record
}));

import { leaveCompanionSyncGroup } from './syncGroupDeparture';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.endpoint.mockResolvedValue('http://192.168.1.2:38641');
  mocks.group.mockResolvedValue({
    group_id: 'group-1', local_host_name: 'android-1', local_member_state: 'active',
    members: [{ host_name: 'android-1', state: 'active' }, { host_name: 'desktop-1', state: 'active' }]
  });
  mocks.headers.mockResolvedValue({ 'X-Signature': 'signed' });
  mocks.prepare.mockResolvedValue({
    body: 'encrypted-departure', headers: {
      'Content-Type': 'application/vnd.foliole.workgroup-aead+json',
      'X-Authorization-Id': 'authorization-android', 'X-Signature': 'signed',
      'X-Sync-Group-Id': 'group-1'
    }
  });
  mocks.resolveTargets.mockResolvedValue([{ endpointUrl: 'http://192.168.1.2:38641' }]);
  mocks.bind.mockResolvedValue(undefined);
  mocks.request.mockResolvedValue({ body: '{"status":"accepted"}', status: 200 });
  mocks.record.mockResolvedValue(undefined);
  mocks.stop.mockResolvedValue(undefined);
  mocks.clear.mockResolvedValue(undefined);
  mocks.clearPairing.mockResolvedValue(undefined);
});

it('records a local departure only after another Device accepts it', async () => {
  await leaveCompanionSyncGroup();
  expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({
    body: 'encrypted-departure', method: 'POST',
    url: 'http://192.168.1.2:38641/companion/sync-group/departure'
  }));
  expect(JSON.stringify(mocks.request.mock.calls)).not.toContain('persistent-workgroup-key');
  expect(mocks.bind).toHaveBeenCalledWith({ endpointUrl: 'http://192.168.1.2:38641' });
  expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({
    authorizationId: 'leave-departure-1', hostName: 'android-1', groupId: 'group-1'
  }));
  const requestOrder = mocks.request.mock.invocationCallOrder[0];
  const recordOrder = mocks.record.mock.invocationCallOrder[0];
  expect(requestOrder).toBeDefined();
  expect(recordOrder).toBeDefined();
  if (requestOrder === undefined || recordOrder === undefined) throw new Error('missing_call_order');
  expect(requestOrder).toBeLessThan(recordOrder);
  expect(mocks.stop).toHaveBeenCalledOnce();
  expect(mocks.clear).toHaveBeenCalledOnce();
  expect(mocks.clearPairing).toHaveBeenCalledOnce();
});

it('prepares Leave without starting a missing or paused provider session', async () => {
  await leaveCompanionSyncGroup();

  expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({
    bodyText: expect.stringContaining('"group_id":"group-1"'),
    endpointUrl: 'http://192.168.1.2:38641', method: 'POST'
  }));
  expect(mocks.stop).toHaveBeenCalledTimes(1);
  expect(mocks.stop.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.request.mock.invocationCallOrder[0]!);
});

it('keeps local membership and credentials when no Device accepts the departure', async () => {
  mocks.request.mockResolvedValue({ body: '{}', status: 503 });
  await expect(leaveCompanionSyncGroup()).rejects.toThrow('sync_group_departure_http_503');
  expect(mocks.record).not.toHaveBeenCalled();
  expect(mocks.clear).not.toHaveBeenCalled();
  expect(mocks.clearPairing).not.toHaveBeenCalled();
});

it('routes Leave to an active identity-bound peer when the stored endpoint has departed', async () => {
  mocks.resolveTargets.mockResolvedValue([{
    hostName: 'desktop-2', endpointUrl: 'http://192.168.1.3:38641', groupId: 'group-1'
  }]);

  await leaveCompanionSyncGroup();

  expect(mocks.resolveTargets).toHaveBeenCalledWith('http://192.168.1.2:38641', {
    allowWhileNotParticipating: true
  });
  expect(mocks.bind).toHaveBeenCalledWith({
    hostName: 'desktop-2', endpointUrl: 'http://192.168.1.3:38641', groupId: 'group-1'
  });
  expect(mocks.prepare).toHaveBeenCalledWith(expect.objectContaining({
    endpointUrl: 'http://192.168.1.3:38641'
  }));
  expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({
    url: 'http://192.168.1.3:38641/companion/sync-group/departure'
  }));
  expect(mocks.record).toHaveBeenCalledOnce();
  expect(mocks.clear).toHaveBeenCalledOnce();
});

it('keeps local membership when no active identity-bound peer is reachable', async () => {
  mocks.resolveTargets.mockResolvedValue([]);

  await expect(leaveCompanionSyncGroup()).rejects.toThrow('sync_group_departure_peer_unavailable');

  expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.record).not.toHaveBeenCalled();
  expect(mocks.clear).not.toHaveBeenCalled();
  expect(mocks.clearPairing).not.toHaveBeenCalled();
});

it('clears the final local membership without requiring a reachable Device', async () => {
  mocks.group.mockResolvedValue({
    group_id: 'group-1', local_host_name: 'android-1', local_member_state: 'active',
    members: [{ host_name: 'android-1', state: 'active' }, { host_name: 'desktop-1', state: 'left' }]
  });
  mocks.endpoint.mockResolvedValue(null);

  await leaveCompanionSyncGroup();

  expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.record).toHaveBeenCalledOnce();
  expect(mocks.stop).toHaveBeenCalledOnce();
  expect(mocks.clear).toHaveBeenCalledOnce();
});
