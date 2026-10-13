import { beforeEach, expect, it, vi } from 'vitest';

/* eslint-disable import/order -- Vitest mocks must register before the subject loads. */
import { getRuntime } from './desktopSyncGroupAutoSync.testSupport.js';
import { recoverDesktopSyncGroupDiscovery, runDesktopManualSyncWithDiscovery,
  startDesktopSyncGroupAutoSync, stopDesktopSyncGroupAutoSync } from './desktopSyncGroupAutoSync.js';
import { loadDesktopSyncGroupDiscoveryError } from './desktopSyncGroupDiscoveryStatus.js';
import { loadDesktopSyncGroupRoutes } from './desktopSyncGroupRoutes.js';

const runtime = getRuntime();
const desktop = { endpoint_url: 'http://windows:38641', group_id: 'group-1', local_device_id: 'desktop-a',
  peer_device_id: 'desktop-b', peer_device_name: 'Windows', peer_platform: 'win32' };
const phone = { ...desktop, endpoint_url: 'http://phone:38641', peer_device_id: 'phone',
  peer_device_name: 'Phone', peer_platform: 'ios-capacitor' };

beforeEach(() => {
  stopDesktopSyncGroupAutoSync();
  vi.clearAllMocks();
  runtime.participating = true;
  runtime.persistedRoute = null;
  runtime.memberSessionArgs = null;
  runtime.memberEndpoints = [];
  runtime.requireOwner = false;
  runtime.discovery.mockResolvedValue([]);
});

it('continues a pending Readwise switch on discovery changes and completed sync', async () => {
  startDesktopSyncGroupAutoSync();
  runtime.memberSessionArgs?.onChanged();
  runtime.syncCompleted?.();
  await vi.waitFor(() => expect(runtime.readwiseContinue).toHaveBeenCalledTimes(2));
});

it('retains routes to every reachable desktop and foreground phone without electing a role', async () => {
  startDesktopSyncGroupAutoSync();
  await expect(runtime.memberSessionArgs?.onMember(desktop)).resolves.toBe(true);
  await expect(runtime.memberSessionArgs?.onMember(phone)).resolves.toBe(true);
  expect(loadDesktopSyncGroupRoutes('group-1')).toEqual([desktop, phone]);
  expect(runtime.coordinator).toHaveBeenCalledWith('automatic', phone);
  expect(runtime.freshness).toHaveBeenCalledWith(true);
  expect(runtime.updateRole).not.toHaveBeenCalled();
});

it('coalesces duplicate discovery activation for a peer', async () => {
  let finish: (value: { status: string }) => void = () => {};
  runtime.coordinator.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  startDesktopSyncGroupAutoSync();
  const first = runtime.memberSessionArgs?.onMember(phone);
  const second = runtime.memberSessionArgs?.onMember(phone);
  expect(first).toBe(second);
  finish({ status: 'completed' });
  await first;
  expect(runtime.coordinator).toHaveBeenCalledOnce();
});

it('removes an unavailable peer while leaving other reachable routes eligible', async () => {
  startDesktopSyncGroupAutoSync();
  await runtime.memberSessionArgs?.onMember(desktop);
  await runtime.memberSessionArgs?.onMember(phone);
  runtime.memberSessionArgs?.onMemberLost('phone');
  expect(loadDesktopSyncGroupRoutes('group-1')).toEqual([desktop]);
  expect(runtime.freshness).toHaveBeenLastCalledWith(true);
});

it('collects all known endpoints for a manual sync including phones', async () => {
  runtime.memberEndpoints = [desktop, phone];
  await runDesktopManualSyncWithDiscovery();
  expect(runtime.coordinator).toHaveBeenCalledWith('manual');
  expect(loadDesktopSyncGroupRoutes('group-1')).toEqual([desktop, phone]);
});

it('discovers and retains every matching peer when manual sync starts without a route', async () => {
  runtime.discovery.mockResolvedValue([desktop, phone].map(peer => ({ endpoint_url: peer.endpoint_url,
    group_id: peer.group_id, provider_device_id: peer.peer_device_id,
    provider_device_name: peer.peer_device_name, provider_platform: peer.peer_platform })));
  await runDesktopManualSyncWithDiscovery();
  expect(runtime.coordinator).toHaveBeenCalledWith('manual');
  expect(loadDesktopSyncGroupRoutes('group-1').map(peer => peer.peer_device_id)).toEqual(['desktop-b', 'phone']);
});

it('records no reachable peer without inventing an anchor or starting a round', async () => {
  runtime.requireOwner = true;
  await expect(runDesktopManualSyncWithDiscovery()).resolves.toBeNull();
  expect(runtime.recordNoPeer).toHaveBeenCalledWith('manual');
  expect(runtime.coordinator).not.toHaveBeenCalled();
});

it('reports discovery denial and recovers the existing peer discovery session', async () => {
  startDesktopSyncGroupAutoSync();
  runtime.memberSessionArgs?.onDiscoveryState(new Error('EACCES'));
  expect(loadDesktopSyncGroupDiscoveryError()).toBe('permission_required');
  runtime.memberSessionArgs?.onDiscoveryState(null);
  expect(loadDesktopSyncGroupDiscoveryError()).toBeNull();
  recoverDesktopSyncGroupDiscovery();
  await vi.waitFor(() => expect(runtime.recoverMembers).toHaveBeenCalledOnce());
});
