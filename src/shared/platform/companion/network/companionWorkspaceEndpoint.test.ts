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
    group_id: 'group-1', local_device_id: 'android-b', timeline_id: 'timeline-1',
    members: [
      { device_id: 'desktop-a', state: 'active' },
      { device_id: 'android-b', state: 'active' },
      { device_id: 'desktop-c', state: 'active' },
      { device_id: 'desktop-left', state: 'left' }
    ]
  });
  mocks.discover.mockResolvedValue([
    { compatibility: { status: 'compatible' }, discovery: {
      group_id: 'group-1', peer_id: 'desktop-c', timeline_id: 'timeline-1'
    }, endpointUrl: 'http://192.168.1.30:38641' },
    { compatibility: { status: 'compatible' }, discovery: {
      group_id: 'group-1', peer_id: 'desktop-a', timeline_id: 'timeline-1'
    }, endpointUrl: 'http://192.168.1.20:38641' },
    { compatibility: { status: 'compatible' }, discovery: {
      group_id: 'group-1', peer_id: 'desktop-left', timeline_id: 'timeline-1'
    }, endpointUrl: 'http://192.168.1.40:38641' }
  ]);

  await expect(resolveReachableCompanionWorkspaceSyncEndpoints('http://old:38641')).resolves.toEqual([
    { deviceId: 'desktop-a', endpointUrl: 'http://192.168.1.20:38641', groupId: 'group-1' },
    { deviceId: 'desktop-c', endpointUrl: 'http://192.168.1.30:38641', groupId: 'group-1' }
  ]);
});

it('keeps routing reachable members when another active peer is unavailable', async () => {
  mocks.loadGroup.mockResolvedValue({
    group_id: 'group-1', local_device_id: 'android-b', timeline_id: 'timeline-1',
    members: [{ device_id: 'desktop-a', state: 'active' }, { device_id: 'desktop-c', state: 'active' }]
  });
  mocks.discover.mockResolvedValue([{
    compatibility: { status: 'compatible' },
    discovery: { group_id: 'group-1', peer_id: 'desktop-c', timeline_id: 'timeline-1' },
    endpointUrl: 'http://192.168.1.30:38641'
  }]);

  await expect(resolveReachableCompanionWorkspaceSyncEndpoints('http://old:38641'))
    .resolves.toEqual([{ deviceId: 'desktop-c', endpointUrl: 'http://192.168.1.30:38641', groupId: 'group-1' }]);
});

it('binds a discovered route to the stored peer identity through the native bridge', async () => {
  await bindCompanionWorkspaceSyncTarget({
    deviceId: 'desktop-a', endpointUrl: 'http://192.168.1.20:38641', groupId: 'group-1'
  });

  expect(mocks.bindRoute).toHaveBeenCalledWith({
    endpoint_url: 'http://192.168.1.20:38641',
    peer_device_id: 'desktop-a',
    sync_group_id: 'group-1'
  });
});
