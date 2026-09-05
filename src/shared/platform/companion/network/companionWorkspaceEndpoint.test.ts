import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  discover: vi.fn(),
  loadCandidates: vi.fn(),
  loadGroup: vi.fn(),
  native: true
}));

vi.mock('../../companionWorkspaceDiscovery', () => ({
  discoverCompanionDesktops: runtime.discover,
  loadCompanionDiscoveryCandidates: runtime.loadCandidates
}));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({
  isNativeCompanionNetworkRuntime: () => runtime.native,
  normalizeEndpointUrl: (value: string) => value,
  WORKSPACE_VERSION_PATH: '/api/workspace/version'
}));
vi.mock('../sync/syncGroupStore', () => ({ loadCompanionSyncGroup: runtime.loadGroup }));

import {
  bindCompanionWorkspaceSyncTarget,
  resolveReachableCompanionWorkspaceSyncEndpoints
} from './companionWorkspaceEndpoint';

const group = {
  created_at: '2026-08-26T00:00:00.000Z', display_name: 'Studio', group_id: 'group-1',
  local_device_identity_key: 'device-local', devices: [
    device('device-local', 'Local', 'android-capacitor'),
    device('device-mac', 'Mac', 'darwin'),
    { ...device('device-left', 'Left', 'win32'), state: 'left' as const }
  ]
};

function device(id: string, name: string, platform: string) {
  return {
    canonical_library_path: `/${id}`, contract_version: 1 as const, device_anchor: `${id}-anchor`,
    device_identity_key: id, device_name: name, joined_at: '2026-08-26T00:00:00.000Z',
    last_seen_at: null, left_at: null, platform, state: 'active' as const,
    updated_at: '2026-08-26T00:00:00.000Z'
  };
}

beforeEach(() => {
  runtime.native = true;
  runtime.loadGroup.mockReset().mockResolvedValue(group);
  runtime.loadCandidates.mockReset().mockResolvedValue([]);
  runtime.discover.mockReset().mockResolvedValue([{
    compatibility: { status: 'compatible' }, endpointUrl: 'http://mac:38641',
    discovery: { group_id: 'group-1', provider_device_id: 'device-mac' }
  }]);
});

it('routes only active remote Devices discovered in the same Sync Group', async () => {
  await expect(resolveReachableCompanionWorkspaceSyncEndpoints('http://old:38641')).resolves.toEqual([{
    deviceId: 'device-mac', deviceName: 'Mac', endpointUrl: 'http://mac:38641', groupId: 'group-1'
  }]);
});

it('uses the verified preferred endpoint before scanning for one remote Device', async () => {
  runtime.loadCandidates.mockResolvedValueOnce([{
    compatibility: { status: 'compatible' }, endpointUrl: 'http://accepted:38641',
    discovery: { group_id: 'group-1', provider_device_id: 'device-mac' }
  }]);

  await expect(resolveReachableCompanionWorkspaceSyncEndpoints('http://accepted:38641')).resolves.toEqual([{
    deviceId: 'device-mac', deviceName: 'Mac', endpointUrl: 'http://accepted:38641', groupId: 'group-1'
  }]);
  expect(runtime.discover).not.toHaveBeenCalled();
});

it('falls back to discovery when the preferred endpoint no longer identifies the remote Device', async () => {
  runtime.loadCandidates.mockResolvedValueOnce([{
    compatibility: { status: 'compatible' }, endpointUrl: 'http://accepted:38641',
    discovery: { group_id: 'group-1', provider_device_id: 'device-other' }
  }]);

  await expect(resolveReachableCompanionWorkspaceSyncEndpoints('http://accepted:38641')).resolves.toEqual([{
    deviceId: 'device-mac', deviceName: 'Mac', endpointUrl: 'http://mac:38641', groupId: 'group-1'
  }]);
  expect(runtime.discover).toHaveBeenCalledOnce();
});

it('uses the accepted group-bound endpoint to bootstrap the first Sync Pack', async () => {
  runtime.loadGroup.mockResolvedValue({ ...group, devices: [group.devices[0]] });

  await expect(resolveReachableCompanionWorkspaceSyncEndpoints('http://accepted:38641')).resolves.toEqual([{
    endpointUrl: 'http://accepted:38641', groupId: 'group-1'
  }]);
  expect(runtime.discover).not.toHaveBeenCalled();
});

it('does not fall back to the accepted endpoint after remote Device inventory exists', async () => {
  runtime.discover.mockResolvedValue([]);

  await expect(resolveReachableCompanionWorkspaceSyncEndpoints('http://old:38641')).resolves.toEqual([]);
});

it('rejects a target from another Sync Group', async () => {
  await expect(bindCompanionWorkspaceSyncTarget({ endpointUrl: 'http://mac:38641', groupId: 'group-2' }))
    .rejects.toThrow('sync_group_identity_mismatch');
});
