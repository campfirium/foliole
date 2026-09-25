import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  coordinator: vi.fn(async () => ({ status: 'completed' })),
  discovery: vi.fn(),
  freshness: vi.fn(),
  memberEndpoints: [] as Array<Record<string, unknown>>,
  memberSessionArgs: null as null | {
    onChanged(): void;
    onMember(peer: Record<string, unknown>): Promise<boolean>;
    onMemberLost(deviceId: string): void;
  },
  notifyOverviewChanged: vi.fn(),
  readwiseContinue: vi.fn(async () => null),
  syncCompleted: null as null | (() => void),
  owned: false,
  requireOwner: false,
  group: {
    devices: [
      { device_identity_key: 'desktop-a', device_name: 'Mac', platform: 'darwin', state: 'active' },
      { device_identity_key: 'desktop-b', device_name: 'Windows', platform: 'win32', state: 'active' }
    ],
    group_id: 'group-1', local_device_identity_key: 'desktop-a'
  },
  participating: true,
  persistedRoute: null as null | Record<string, unknown>,
  role: 'observing',
  sessionArgs: null as null | Record<string, (...args: never[]) => unknown>,
  stop: vi.fn(),
  updateRole: vi.fn(async () => undefined)
}));

vi.mock('../database/connection.js', () => ({
  runWithDatabaseConnectionOwner: async <T>(execute: () => Promise<T> | T) => {
    runtime.owned = true;
    try { return await execute(); } finally { runtime.owned = false; }
  }
}));
vi.mock('../database/syncGroupStore.js', () => ({ loadDesktopSyncGroup: () => {
  if (runtime.requireOwner && !runtime.owned) throw new Error('sqlite owner required');
  return runtime.group;
} }));
vi.mock('../database/syncGroupMemberStateStore.js', () => ({
  isDesktopSyncGroupDeviceBlocked: () => false
}));
vi.mock('../database/settingsStore.js', () => ({
  loadJsonSetting: () => runtime.persistedRoute,
  saveJsonSetting: (_key: string, value: null | Record<string, unknown>) => {
    runtime.persistedRoute = value;
  }
}));
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
vi.mock('./desktopSyncCoordinator.js', () => ({ runDesktopSyncCoordinator: runtime.coordinator,
  subscribeDesktopSyncCompleted: (callback: () => void) => {
    runtime.syncCompleted = callback;
    return () => { runtime.syncCompleted = null; };
  } }));
vi.mock('./desktopSyncGroupDiscovery.js', () => ({ discoverDesktopSyncGroups: runtime.discovery }));
vi.mock('./desktopSyncGroupOverviewNotifier.js', () => ({
  notifyDesktopSyncGroupOverviewChanged: runtime.notifyOverviewChanged
}));
vi.mock('./desktopSyncGroupMemberStateSession.js', () => ({
  exchangeAllDesktopSyncGroupMemberStates: vi.fn(async () => false),
  loadDesktopSyncGroupMemberEndpoints: () => runtime.memberEndpoints,
  startDesktopSyncGroupMemberStateSession: (_group: unknown, onChanged: () => void,
    onMember: (peer: Record<string, unknown>) => Promise<boolean>,
    onMemberLost: (deviceId: string) => void) => {
    runtime.memberSessionArgs = { onChanged, onMember, onMemberLost };
    return { stop: vi.fn() };
  }
}));
vi.mock('./readwiseOwnerHandoff.js', () => ({
  continuePendingReadwiseHandoff: runtime.readwiseContinue
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
  runtime.participating = true;
  runtime.persistedRoute = null;
  runtime.role = 'observing';
  runtime.sessionArgs = null;
  runtime.memberSessionArgs = null;
  runtime.memberEndpoints = [];
  runtime.requireOwner = false;
  runtime.discovery.mockResolvedValue([]);
});

it('continues a pending Readwise switch when the old desktop appears or sync completes', async () => {
  startDesktopSyncGroupAutoSync();
  runtime.memberSessionArgs?.onChanged();
  runtime.syncCompleted?.();
  await vi.waitFor(() => expect(runtime.readwiseContinue).toHaveBeenCalledTimes(2));
});

it('resumes an interrupted mobile guide route after restart and clears it on success', async () => {
  runtime.persistedRoute = {
    endpoint_url: 'http://android:38641', group_id: 'group-1',
    local_device_id: 'desktop-a', peer_device_id: 'android-b',
    peer_device_name: 'A5', peer_platform: 'android-capacitor', route_kind: 'mobile_guide'
  };

  startDesktopSyncGroupAutoSync();

  await vi.waitFor(() => expect(runtime.coordinator).toHaveBeenCalledWith(
    'automatic', expect.objectContaining({ peer_device_id: 'android-b' })
  ));
  await vi.waitFor(() => expect(runtime.persistedRoute).toBeNull());
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

it('invalidates the renderer overview whenever topology state changes', () => {
  startDesktopSyncGroupAutoSync();
  const onState = runtime.sessionArgs?.onState as (state: { role: string }) => void;

  onState({ role: 'member' });

  expect(runtime.notifyOverviewChanged).toHaveBeenCalledOnce();
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

it('lets the anchor collect and retain a periodic route to a desktop member', async () => {
  runtime.role = 'anchor';
  startDesktopSyncGroupAutoSync();
  const member = {
    endpoint_url: 'http://windows:38641', group_id: 'group-1',
    local_device_id: 'desktop-a', peer_device_id: 'desktop-b',
    peer_device_name: 'Windows', peer_platform: 'win32'
  };

  await expect(runtime.memberSessionArgs?.onMember(member)).resolves.toBe(true);

  expect(runtime.coordinator).toHaveBeenCalledWith('automatic', expect.objectContaining({
    peer_device_id: 'desktop-b', route_kind: 'member'
  }));
  expect(loadDesktopSyncGroupRoutes('group-1')).toEqual([expect.objectContaining({
    peer_device_id: 'desktop-b', route_kind: 'member'
  })]);
  expect(runtime.freshness).toHaveBeenCalledWith(true);
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

it('completes an anchor manual action without polling a member', async () => {
  runtime.role = 'anchor';

  await expect(runDesktopManualSyncWithDiscovery()).resolves.toBeNull();

  expect(runtime.discovery).not.toHaveBeenCalled();
  expect(runtime.coordinator).not.toHaveBeenCalled();
});

it('checks collected desktop members when the anchor runs Sync Now', async () => {
  runtime.role = 'anchor';
  startDesktopSyncGroupAutoSync();
  await runtime.memberSessionArgs?.onMember({
    endpoint_url: 'http://windows:38641', group_id: 'group-1',
    local_device_id: 'desktop-a', peer_device_id: 'desktop-b',
    peer_device_name: 'Windows', peer_platform: 'win32'
  });
  runtime.coordinator.mockClear();

  await runDesktopManualSyncWithDiscovery();

  expect(runtime.coordinator).toHaveBeenCalledWith('manual');
});

it('checks a discovered desktop member even when its automatic route was not activated', async () => {
  runtime.role = 'anchor';
  runtime.memberEndpoints = [{
    endpoint_url: 'http://windows:38641', group_id: 'group-1',
    local_device_id: 'desktop-a', peer_device_id: 'desktop-b',
    peer_device_name: 'Windows', peer_platform: 'win32', route_kind: 'member'
  }];

  await runDesktopManualSyncWithDiscovery();

  expect(runtime.coordinator).toHaveBeenCalledWith('manual');
  expect(loadDesktopSyncGroupRoutes('group-1')).toEqual([expect.objectContaining({
    peer_device_id: 'desktop-b', route_kind: 'member'
  })]);
});

it('does not use a discovered anchor as a member route', async () => {
  runtime.role = 'anchor';
  runtime.memberEndpoints = [{
    endpoint_url: 'http://other-anchor:38641', group_id: 'group-1',
    local_device_id: 'desktop-a', peer_device_id: 'desktop-b',
    peer_device_name: 'Windows', peer_platform: 'win32', route_kind: 'anchor'
  }];

  await expect(runDesktopManualSyncWithDiscovery()).resolves.toBeNull();
  expect(runtime.coordinator).not.toHaveBeenCalled();
});

it('owns the group read when manual sync overlaps another database transaction', async () => {
  runtime.role = 'anchor';
  runtime.requireOwner = true;

  await expect(runDesktopManualSyncWithDiscovery()).resolves.toBeNull();
});
