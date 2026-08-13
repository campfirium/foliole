import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bind: vi.fn(), clear: vi.fn(), endpoint: vi.fn(), group: vi.fn(), headers: vi.fn(),
  record: vi.fn(), request: vi.fn(), resolveTargets: vi.fn(), stop: vi.fn(), uuid: vi.fn(() => 'departure-1')
}));

vi.mock('../../companionWorkspacePairing', () => ({ createSignedRequestHeaders: mocks.headers }));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: {
    clearSyncGroupCredentials: mocks.clear,
    desktopHttpRequest: mocks.request,
    stopSyncGroupProvider: mocks.stop
  }
}));
vi.mock('../../companionUuid', () => ({ createCompanionUuid: mocks.uuid }));
vi.mock('../network/companionWorkspaceEndpoint', () => ({
  bindCompanionWorkspaceSyncTarget: mocks.bind,
  resolveReachableCompanionWorkspaceSyncEndpoints: mocks.resolveTargets
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
    group_id: 'group-1', local_device_id: 'android-1', local_member_state: 'active',
    members: [{ device_id: 'android-1', state: 'active' }, { device_id: 'desktop-1', state: 'active' }]
  });
  mocks.headers.mockResolvedValue({ 'X-Signature': 'signed' });
  mocks.resolveTargets.mockResolvedValue([{ endpointUrl: 'http://192.168.1.2:38641' }]);
  mocks.bind.mockResolvedValue(undefined);
  mocks.request.mockResolvedValue({ body: '{"status":"accepted"}', status: 200 });
  mocks.record.mockResolvedValue(undefined);
  mocks.stop.mockResolvedValue(undefined);
  mocks.clear.mockResolvedValue(undefined);
});

it('records a local departure only after another Device accepts it', async () => {
  await leaveCompanionSyncGroup();
  expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({
    method: 'POST', url: 'http://192.168.1.2:38641/companion/sync-group/departure'
  }));
  expect(mocks.bind).toHaveBeenCalledWith({ endpointUrl: 'http://192.168.1.2:38641' });
  expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({
    authorizationId: 'leave-departure-1', deviceId: 'android-1', groupId: 'group-1'
  }));
  const requestOrder = mocks.request.mock.invocationCallOrder[0];
  const recordOrder = mocks.record.mock.invocationCallOrder[0];
  expect(requestOrder).toBeDefined();
  expect(recordOrder).toBeDefined();
  if (requestOrder === undefined || recordOrder === undefined) throw new Error('missing_call_order');
  expect(requestOrder).toBeLessThan(recordOrder);
  expect(mocks.stop).toHaveBeenCalledOnce();
  expect(mocks.clear).toHaveBeenCalledOnce();
});

it('keeps local membership and credentials when no Device accepts the departure', async () => {
  mocks.request.mockResolvedValue({ body: '{}', status: 503 });
  await expect(leaveCompanionSyncGroup()).rejects.toThrow('sync_group_departure_http_503');
  expect(mocks.record).not.toHaveBeenCalled();
  expect(mocks.clear).not.toHaveBeenCalled();
});

it('routes Leave to an active identity-bound peer when the stored endpoint has departed', async () => {
  mocks.resolveTargets.mockResolvedValue([{
    deviceId: 'desktop-2', endpointUrl: 'http://192.168.1.3:38641', groupId: 'group-1'
  }]);

  await leaveCompanionSyncGroup();

  expect(mocks.resolveTargets).toHaveBeenCalledWith('http://192.168.1.2:38641', {
    allowWhileNotParticipating: true
  });
  expect(mocks.bind).toHaveBeenCalledWith({
    deviceId: 'desktop-2', endpointUrl: 'http://192.168.1.3:38641', groupId: 'group-1'
  });
  expect(mocks.headers).toHaveBeenCalledWith(expect.objectContaining({
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
});

it('clears the final local membership without requiring a reachable Device', async () => {
  mocks.group.mockResolvedValue({
    group_id: 'group-1', local_device_id: 'android-1', local_member_state: 'active',
    members: [{ device_id: 'android-1', state: 'active' }, { device_id: 'desktop-1', state: 'left' }]
  });
  mocks.endpoint.mockResolvedValue(null);

  await leaveCompanionSyncGroup();

  expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.record).toHaveBeenCalledOnce();
  expect(mocks.stop).toHaveBeenCalledOnce();
  expect(mocks.clear).toHaveBeenCalledOnce();
});
