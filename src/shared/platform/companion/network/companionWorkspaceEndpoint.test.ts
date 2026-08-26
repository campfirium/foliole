import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  discover: vi.fn(),
  loadGroup: vi.fn(),
  native: true
}));

vi.mock('../../companionWorkspaceDiscovery', () => ({
  discoverCompanionDesktops: runtime.discover
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

it('rejects a target from another Sync Group', async () => {
  await expect(bindCompanionWorkspaceSyncTarget({ endpointUrl: 'http://mac:38641', groupId: 'group-2' }))
    .rejects.toThrow('sync_group_identity_mismatch');
});
