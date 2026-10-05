import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apply: vi.fn(),
  blocked: vi.fn(),
  load: vi.fn(),
  request: vi.fn(),
  sign: vi.fn()
}));

vi.mock('../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: { desktopHttpRequest: mocks.request },
  isNativeCompanionNetworkRuntime: () => true
}));
vi.mock('../sync/syncGroupMemberStateStore', () => ({
  applyCompanionSyncGroupMemberState: mocks.apply,
  isCompanionSyncGroupDeviceBlocked: mocks.blocked,
  loadCompanionSyncGroupMemberState: mocks.load
}));
vi.mock('./signedRequest', () => ({ prepareNativeCompanionWorkgroupRequest: mocks.sign }));

import { exchangeCompanionSyncGroupMemberState } from './companionSyncGroupMemberState';

const state = {
  contract_version: 3 as const,
  devices: [],
  group_id: 'group-1',
  library_epoch: 'epoch',
  proof_revision: 0,
  removals: [],
  restore: null,
  source_proof_revisions: {},
  sender_device_identity_key: 'device-mobile'
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.load.mockResolvedValue(state);
  mocks.sign.mockResolvedValue({ body: 'encrypted-member-state', headers: { 'X-Signature': 'signed' } });
  mocks.request.mockResolvedValue({ body: JSON.stringify({
    ...state, sender_device_identity_key: 'device-desktop'
  }), status: 200 });
  mocks.apply.mockResolvedValue({ local_exited: false, normal_sync_ready: true, state });
  mocks.blocked.mockResolvedValue(false);
});

it('persists member state before allowing companion data sync', async () => {
  await expect(exchangeCompanionSyncGroupMemberState({
    deviceId: 'device-desktop', deviceName: 'Mac', endpointUrl: 'http://mac:38641', groupId: 'group-1'
  })).resolves.toEqual({ localExited: false, normalSyncReady: true, peerLibraryEpoch: 'epoch',
    peerRemoved: false, restoreFromPeer: null });

  expect(mocks.sign).toHaveBeenCalledWith(expect.objectContaining({
    bodyText: JSON.stringify(state), pathWithQuery: '/sync-group/member-state'
  }));
  expect(mocks.request).toHaveBeenCalledWith(expect.objectContaining({
    body: 'encrypted-member-state', headers: { 'X-Signature': 'signed' },
    method: 'POST', url: 'http://mac:38641/sync-group/member-state'
  }));
  expect(mocks.apply).toHaveBeenCalledWith(expect.objectContaining({
    sender_device_identity_key: 'device-desktop'
  }), 'device-desktop');
});
