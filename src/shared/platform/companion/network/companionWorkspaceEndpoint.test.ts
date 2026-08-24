import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bindRoute: vi.fn(),
  discover: vi.fn(),
  loadGroup: vi.fn(),
  loadPairing: vi.fn(),
  nativeRuntime: vi.fn(() => true)
}));

vi.mock('../../companionWorkspaceDiscovery', () => ({
  discoverCompanionDesktops: mocks.discover
}));
vi.mock('../../companionWorkspacePairing', () => ({
  createSignedRequestHeaders: vi.fn(),
  loadCompanionPairingState: mocks.loadPairing
}));
vi.mock('../sync/syncGroupStore', () => ({
  loadCompanionSyncGroup: mocks.loadGroup
}));
vi.mock('../../companionWorkspaceRuntimeRepository', () => ({
  FolioleCompanionSync: { bindSyncGroupPeerRoute: mocks.bindRoute },
  isNativeCompanionPairingRuntime: mocks.nativeRuntime,
  normalizeEndpointUrl: (value: string) => value.replace(/\/$/u, ''),
  WORKSPACE_VERSION_PATH: '/companion/workspace-version'
}));

import {
  bindCompanionWorkspaceSyncTarget,
  resolveReachableCompanionWorkspaceSyncEndpoint,
  resolveReachableCompanionWorkspaceSyncEndpoints
} from './companionWorkspaceEndpoint';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.nativeRuntime.mockReturnValue(true);
  mocks.loadGroup.mockResolvedValue(null);
  mocks.loadPairing.mockResolvedValue({ remote_peer_id: 'paired-desktop' });
});

it('refreshes a stale LAN endpoint only to the already paired desktop', async () => {
  mocks.discover.mockResolvedValue([
    { discovery: { peer_id: 'other-desktop' }, endpointUrl: 'http://192.168.1.20:38641' },
    { discovery: { peer_id: 'paired-desktop' }, endpointUrl: 'http://192.168.1.30:38641' }
  ]);

  await expect(resolveReachableCompanionWorkspaceSyncEndpoint('http://192.168.1.10:38641'))
    .resolves.toBe('http://192.168.1.30:38641');
});

it('keeps the stored endpoint when discovery cannot prove the paired desktop', async () => {
  mocks.discover.mockResolvedValue([
    { discovery: { peer_id: 'other-desktop' }, endpointUrl: 'http://192.168.1.20:38641' }
  ]);

  await expect(resolveReachableCompanionWorkspaceSyncEndpoint('http://192.168.1.10:38641'))
    .resolves.toBe('http://192.168.1.10:38641');
});

it('does not perform native discovery for a non-native runtime', async () => {
  mocks.nativeRuntime.mockReturnValue(false);

  await expect(resolveReachableCompanionWorkspaceSyncEndpoint('http://desktop.local/'))
    .resolves.toBe('http://desktop.local');
  expect(mocks.discover).not.toHaveBeenCalled();
});

it('routes one foreground pass to every discovered active group member', async () => {
  mocks.loadGroup.mockResolvedValue({
    group_id: 'group-1', local_host_name: 'Android B', timeline_id: 'timeline-1',
    members: [
      { authorization_id: 'authorization-desktop-a', host_name: 'Desktop A', state: 'active' },
      { authorization_id: 'authorization-android-b', host_name: 'Android B', state: 'active' },
      { authorization_id: 'authorization-desktop-c', host_name: 'Desktop C', state: 'active' },
      { authorization_id: 'authorization-desktop-left', host_name: 'Desktop Left', state: 'left' }
    ]
  });
  mocks.discover.mockResolvedValue([
    { compatibility: { status: 'compatible' }, discovery: {
      desktop_host_name: 'Desktop C', group_id: 'group-1', peer_id: 'authorization-desktop-c',
      provider_device_id: 'desktop-c', timeline_id: 'timeline-1'
    }, endpointUrl: 'http://192.168.1.30:38641' },
    { compatibility: { status: 'compatible' }, discovery: {
      desktop_host_name: 'Renamed Desktop A', group_id: 'group-1', peer_id: 'authorization-desktop-a',
      provider_device_id: 'desktop-a', timeline_id: 'timeline-1'
    }, endpointUrl: 'http://192.168.1.20:38641' },
    { compatibility: { status: 'compatible' }, discovery: {
      desktop_host_name: 'Desktop Left', group_id: 'group-1', peer_id: 'desktop-left', timeline_id: 'timeline-1'
    }, endpointUrl: 'http://192.168.1.40:38641' }
  ]);

  await expect(resolveReachableCompanionWorkspaceSyncEndpoints('http://old:38641')).resolves.toEqual([
    { authorizationId: 'authorization-desktop-a', endpointUrl: 'http://192.168.1.20:38641', groupId: 'group-1', hostName: 'Desktop A' },
    { authorizationId: 'authorization-desktop-c', endpointUrl: 'http://192.168.1.30:38641', groupId: 'group-1', hostName: 'Desktop C' }
  ]);
});

it('keeps routing reachable members when another active peer is unavailable', async () => {
  mocks.loadGroup.mockResolvedValue({
    group_id: 'group-1', local_host_name: 'Android B', timeline_id: 'timeline-1',
    members: [
      { authorization_id: 'authorization-desktop-a', host_name: 'Desktop A', state: 'active' },
      { authorization_id: 'authorization-desktop-c', host_name: 'Desktop C', state: 'active' }
    ]
  });
  mocks.discover.mockResolvedValue([{
    compatibility: { status: 'compatible' },
    discovery: { desktop_host_name: 'Desktop C', group_id: 'group-1', peer_id: 'authorization-desktop-c',
      provider_device_id: 'desktop-c', timeline_id: 'timeline-1' },
    endpointUrl: 'http://192.168.1.30:38641'
  }]);

  await expect(resolveReachableCompanionWorkspaceSyncEndpoints('http://old:38641'))
    .resolves.toEqual([{ authorizationId: 'authorization-desktop-c', endpointUrl: 'http://192.168.1.30:38641',
      groupId: 'group-1', hostName: 'Desktop C' }]);
});

it('binds a joined-empty route from active member authorization without pairing Device identity', async () => {
  mocks.loadPairing.mockResolvedValue({ is_paired: false });
  mocks.loadGroup.mockResolvedValue({
    group_id: 'group-1', local_host_name: 'Android B', members: [
      { authorization_id: 'authorization-android-b', host_name: 'Android B',
        host_platform: 'android-capacitor', state: 'active' },
      { host_name: 'Desktop A', host_platform: 'darwin', state: 'active' }
    ], timeline_id: 'timeline-1'
  });
  await bindCompanionWorkspaceSyncTarget({
    authorizationId: 'authorization-desktop-a', endpointUrl: 'http://192.168.1.20:38641',
    groupId: 'group-1', hostName: 'Desktop A'
  });

  expect(mocks.loadPairing).not.toHaveBeenCalled();
  expect(mocks.bindRoute).toHaveBeenCalledWith({
    endpoint_url: 'http://192.168.1.20:38641',
    local_authorization_id: 'authorization-android-b',
    local_host_name: 'Android B',
    peer_authorization_id: 'authorization-desktop-a',
    peer_host_name: 'Desktop A',
    peer_host_platform: 'darwin',
    sync_group_id: 'group-1'
  });
});
