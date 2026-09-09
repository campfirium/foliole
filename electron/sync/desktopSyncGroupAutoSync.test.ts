import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  coordinator: vi.fn(async () => ({ status: 'completed' })),
  discovery: vi.fn(),
  freshness: vi.fn(),
  group: {
    devices: [
      { device_identity_key: 'desktop-a', device_name: 'Mac', platform: 'darwin', state: 'active' },
      { device_identity_key: 'desktop-b', device_name: 'Windows', platform: 'win32', state: 'active' }
    ],
    group_id: 'group-1', local_device_identity_key: 'desktop-a'
  },
  participating: true,
  role: 'observing',
  sessionArgs: null as null | Record<string, (...args: never[]) => unknown>,
  stop: vi.fn(),
  updateRole: vi.fn(async () => undefined)
}));

vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => runtime.group }));
vi.mock('./desktopAnchorTopologyRole.js', () => ({
  loadDesktopAnchorTopologyState: () => ({ role: runtime.role })
}));
vi.mock('./desktopAnchorTopologySession.js', () => ({
  startDesktopAnchorTopologySession: (args: typeof runtime.sessionArgs) => {
    runtime.sessionArgs = args;
    return { stop: runtime.stop };
  }
}));
vi.mock('./desktopCompanionSyncPreference.js', () => ({
  isDesktopCompanionSyncParticipating: () => runtime.participating
}));
vi.mock('./companionMdnsAdvertisement.js', () => ({
  updateCompanionMdnsAdvertisementRole: runtime.updateRole
}));
vi.mock('./desktopMemberSyncCadence.js', () => ({ updateDesktopSyncFreshness: runtime.freshness }));
vi.mock('./desktopSyncCoordinator.js', () => ({ runDesktopSyncCoordinator: runtime.coordinator }));
vi.mock('./desktopSyncGroupDiscovery.js', () => ({ discoverDesktopSyncGroups: runtime.discovery }));

import {
  runDesktopManualSyncWithDiscovery,
  startDesktopSyncGroupAutoSync,
  stopDesktopSyncGroupAutoSync
} from './desktopSyncGroupAutoSync.js';
import { loadDesktopSyncGroupRoutes } from './desktopSyncGroupRoutes.js';

beforeEach(() => {
  stopDesktopSyncGroupAutoSync();
  vi.clearAllMocks();
  runtime.participating = true;
  runtime.role = 'observing';
  runtime.sessionArgs = null;
  runtime.discovery.mockResolvedValue([]);
});

it('keeps exactly one qualified desktop anchor as the automatic route', async () => {
  startDesktopSyncGroupAutoSync();
  runtime.role = 'member';
  const onAnchor = runtime.sessionArgs?.onAnchor as (
    target: { endpointUrl: string; groupId: string; peerDeviceId: string }, requireSync: boolean
  ) => Promise<boolean>;

  await expect(onAnchor({ endpointUrl: 'http://windows:38641', groupId: 'group-1',
    peerDeviceId: 'desktop-b' }, false)).resolves.toBe(true);

  expect(runtime.coordinator).toHaveBeenCalledOnce();
  expect(loadDesktopSyncGroupRoutes('group-1')).toEqual([expect.objectContaining({
    endpoint_url: 'http://windows:38641', peer_device_id: 'desktop-b'
  })]);
});

it('does not make an anchor poll another anchor unless demotion requires a sync', async () => {
  startDesktopSyncGroupAutoSync();
  runtime.role = 'anchor';
  const onAnchor = runtime.sessionArgs?.onAnchor as (
    target: { endpointUrl: string; groupId: string; peerDeviceId: string }, requireSync: boolean
  ) => Promise<boolean>;
  const target = { endpointUrl: 'http://windows:38641', groupId: 'group-1',
    peerDeviceId: 'desktop-b' };

  await expect(onAnchor(target, false)).resolves.toBe(false);
  await expect(onAnchor(target, true)).resolves.toBe(true);
  expect(runtime.coordinator).toHaveBeenCalledOnce();
});

it('uses only the selected anchor for an on-demand manual sync', async () => {
  runtime.participating = false;
  runtime.discovery.mockResolvedValue([{ endpoint_url: 'http://windows:38641',
    group_id: 'group-1', provider_device_id: 'desktop-b', provider_platform: 'win32' }]);

  await runDesktopManualSyncWithDiscovery();

  expect(runtime.coordinator).toHaveBeenCalledWith('manual', expect.objectContaining({
    peer_device_id: 'desktop-b'
  }));
  expect(loadDesktopSyncGroupRoutes('group-1')).toEqual([]);
});
