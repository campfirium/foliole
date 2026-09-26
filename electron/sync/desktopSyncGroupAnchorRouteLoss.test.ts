import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  anchorCallbacks: null as null | {
    onAnchor(target: { endpointUrl: string; groupId: string; peerDeviceId: string },
      requireSync: boolean): Promise<boolean>;
    onAnchorLost(deviceId: string): void;
  },
  coordinator: vi.fn(async (_reason: string, peer?: unknown) => {
    if (!peer) throw new Error('sync_group_peer_unavailable');
    return { status: 'completed' };
  }),
  discovery: vi.fn(async () => []),
  memberLost: null as null | ((deviceId: string) => void),
  role: 'member' as 'member' | 'anchor'
}));

const group = {
  devices: [{ device_identity_key: 'desktop-b', device_name: 'Windows', platform: 'win32', state: 'active' }],
  group_id: 'group-1', local_device_identity_key: 'desktop-a'
};

vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: async <T>(read: () => T) => read()
}));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => group }));
vi.mock('../database/syncGroupMemberStateStore.js', () => ({
  isDesktopSyncGroupDeviceBlocked: () => false
}));
vi.mock('../database/settingsStore.js', () => ({
  loadJsonSetting: () => null, saveJsonSetting: vi.fn()
}));
vi.mock('./desktopAnchorTopologyRole.js', () => ({
  loadDesktopAnchorTopologyState: () => ({
    anchor_device_id: 'desktop-b', role: runtime.role, status: 'ready'
  })
}));
vi.mock('./desktopAnchorTopologySession.js', () => ({
  startDesktopAnchorTopologySession: (callbacks: typeof runtime.anchorCallbacks) => {
    runtime.anchorCallbacks = callbacks;
    return { stop: vi.fn() };
  }
}));
vi.mock('./desktopCompanionSyncPreference.js', () => ({
  isDesktopCompanionSyncParticipating: () => true
}));
vi.mock('./companionMdnsAdvertisement.js', () => ({
  updateCompanionMdnsAdvertisementRole: vi.fn(async () => undefined)
}));
vi.mock('./desktopMemberSyncCadence.js', () => ({ updateDesktopSyncFreshness: vi.fn() }));
vi.mock('./desktopSyncCoordinator.js', () => ({
  runDesktopSyncCoordinator: runtime.coordinator,
  subscribeDesktopSyncCompleted: () => vi.fn()
}));
vi.mock('./desktopSyncGroupDiscovery.js', () => ({ discoverDesktopSyncGroups: runtime.discovery }));
vi.mock('./desktopSyncGroupOverviewNotifier.js', () => ({
  notifyDesktopSyncGroupOverviewChanged: vi.fn()
}));
vi.mock('./desktopSyncGroupMemberStateSession.js', () => ({
  exchangeAllDesktopSyncGroupMemberStates: vi.fn(async () => false),
  loadDesktopSyncGroupMemberEndpoints: () => [],
  startDesktopSyncGroupMemberStateSession: (_group: unknown, _changed: unknown,
    _member: unknown, lost: (deviceId: string) => void) => {
    runtime.memberLost = lost;
    return { stop: vi.fn() };
  }
}));
vi.mock('./readwiseOwnerHandoff.js', () => ({
  continuePendingReadwiseHandoff: vi.fn(async () => null)
}));

import {
  runDesktopManualSyncWithDiscovery,
  startDesktopSyncGroupAutoSync,
  stopDesktopSyncGroupAutoSync
} from './desktopSyncGroupAutoSync.js';
import { loadDesktopSyncGroupRoutes } from './desktopSyncGroupRoutes.js';

beforeEach(() => {
  stopDesktopSyncGroupAutoSync();
  vi.clearAllMocks();
  runtime.anchorCallbacks = null;
  runtime.memberLost = null;
  runtime.role = 'member';
  startDesktopSyncGroupAutoSync();
});

async function connectAnchor() {
  await runtime.anchorCallbacks!.onAnchor({
    endpointUrl: 'http://windows:38641', groupId: 'group-1', peerDeviceId: 'desktop-b'
  }, false);
  runtime.coordinator.mockClear();
}

it('syncs to an HTTP-reachable anchor after member discovery reports it lost', async () => {
  await connectAnchor();

  runtime.memberLost!('desktop-b');
  expect(loadDesktopSyncGroupRoutes('group-1')).toHaveLength(1);
  await runDesktopManualSyncWithDiscovery();

  expect(runtime.discovery).not.toHaveBeenCalled();
  expect(runtime.coordinator).toHaveBeenCalledWith('manual', expect.objectContaining({
    peer_device_id: 'desktop-b'
  }));
});

it('removes the anchor route after the topology probe confirms it unreachable', async () => {
  await connectAnchor();

  runtime.memberLost!('desktop-b');
  runtime.anchorCallbacks!.onAnchorLost('desktop-b');

  expect(loadDesktopSyncGroupRoutes('group-1')).toEqual([]);
  await expect(runDesktopManualSyncWithDiscovery()).rejects.toThrow('sync_group_peer_unavailable');
  expect(runtime.discovery).toHaveBeenCalledOnce();
});
