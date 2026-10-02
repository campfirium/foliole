import { beforeEach, expect, it, vi } from 'vitest';

/* eslint-disable import/order -- Vitest mocks must register before the subject loads. */
import { getRuntime } from './desktopSyncGroupAutoSync.testSupport.js';
import {
  recoverDesktopSyncGroupDiscovery,
  runDesktopManualSyncWithDiscovery,
  startDesktopSyncGroupAutoSync,
  stopDesktopSyncGroupAutoSync
} from './desktopSyncGroupAutoSync.js';
import { loadDesktopSyncGroupDiscoveryError } from './desktopSyncGroupDiscoveryStatus.js';
import { loadDesktopSyncGroupRoutes } from './desktopSyncGroupRoutes.js';

const runtime = getRuntime();

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

it('keeps an unfinished mobile guide route when its device temporarily disappears', async () => {
  let rejectSync: (error: Error) => void = () => undefined;
  runtime.coordinator.mockImplementationOnce(() => new Promise((_, reject) => {
    rejectSync = reject;
  }));
  runtime.persistedRoute = {
    endpoint_url: 'http://android:38641', group_id: 'group-1',
    local_device_id: 'desktop-a', peer_device_id: 'android-b',
    peer_device_name: 'A5', peer_platform: 'android-capacitor', route_kind: 'mobile_guide'
  };

  startDesktopSyncGroupAutoSync();
  runtime.memberSessionArgs?.onMemberLost('android-b');

  expect(runtime.persistedRoute).toEqual(expect.objectContaining({ peer_device_id: 'android-b' }));
  expect(loadDesktopSyncGroupRoutes('group-1')).toEqual([
    expect.objectContaining({ peer_device_id: 'android-b' })
  ]);
  rejectSync(new Error('A5 temporarily unavailable'));
  await vi.waitFor(() => expect(runtime.coordinator).toHaveBeenCalledOnce());
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

it('reports discovery denial and coalesces simultaneous recovery requests', async () => {
  startDesktopSyncGroupAutoSync();
  const onError = runtime.sessionArgs?.onDiscoveryError as (error: Error) => void;
  const onStarted = runtime.sessionArgs?.onDiscoveryStarted as () => void;
  onError(new Error('EACCES'));
  expect(loadDesktopSyncGroupDiscoveryError()).toBe('permission_required');
  recoverDesktopSyncGroupDiscovery();
  recoverDesktopSyncGroupDiscovery();
  await Promise.resolve();
  expect(runtime.recoverTopology).toHaveBeenCalledOnce();
  expect(runtime.recoverMembers).toHaveBeenCalledOnce();
  expect(runtime.recoverAdvertisement).toHaveBeenCalledOnce();
  onStarted();
  expect(loadDesktopSyncGroupDiscoveryError()).toBeNull();
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
  expect(runtime.recordNoPeer).toHaveBeenCalledWith('manual');
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
