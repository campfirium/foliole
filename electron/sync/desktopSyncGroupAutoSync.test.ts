import { beforeEach, expect, it, vi } from 'vitest';

/* eslint-disable import/order -- Vitest mocks must register before the subject loads. */
import { getRuntime } from './desktopSyncGroupAutoSync.testSupport.js';
import { recoverDesktopSyncGroupDiscovery, runDesktopManualSyncWithDiscovery,
  startDesktopSyncGroupAutoSync, stopDesktopSyncGroupAutoSync } from './desktopSyncGroupAutoSync.js';
import { runWithDatabaseConnectionOwner } from '../database/connection.js';
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
  await startDesktopSyncGroupAutoSync();
  runtime.memberSessionArgs?.onChanged();
  runtime.syncCompleted?.();
  await vi.waitFor(() => expect(runtime.readwiseContinue).toHaveBeenCalledTimes(2));
});

it('retains routes to every reachable desktop and foreground phone without electing a role', async () => {
  await startDesktopSyncGroupAutoSync();
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
  await startDesktopSyncGroupAutoSync();
  const first = runtime.memberSessionArgs?.onMember(phone);
  const second = runtime.memberSessionArgs?.onMember(phone);
  expect(first).toBe(second);
  await vi.waitFor(() => expect(runtime.coordinator).toHaveBeenCalledOnce());
  finish({ status: 'completed' });
  await first;
  expect(runtime.coordinator).toHaveBeenCalledOnce();
});

it('removes an unavailable peer while leaving other reachable routes eligible', async () => {
  await startDesktopSyncGroupAutoSync();
  await runtime.memberSessionArgs?.onMember(desktop);
  await runtime.memberSessionArgs?.onMember(phone);
  runtime.memberSessionArgs?.onMemberLost('phone');
  expect(loadDesktopSyncGroupRoutes('group-1')).toEqual([desktop]);
  await vi.waitFor(() => expect(runtime.freshness).toHaveBeenLastCalledWith(true));
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
  await startDesktopSyncGroupAutoSync();
  runtime.memberSessionArgs?.onDiscoveryState(new Error('EACCES'));
  expect(loadDesktopSyncGroupDiscoveryError()).toBe('permission_required');
  runtime.memberSessionArgs?.onDiscoveryState(null);
  expect(loadDesktopSyncGroupDiscoveryError()).toBeNull();
  recoverDesktopSyncGroupDiscovery();
  await vi.waitFor(() => expect(runtime.recoverMembers).toHaveBeenCalledOnce());
});


it('activates after discovery notification while the real database owner is releasing', async () => {
  runtime.requireOwner = true;
  await startDesktopSyncGroupAutoSync();
  runtime.memberSessionArgs?.onChanged();
  await expect(runtime.memberSessionArgs?.onMember(desktop)).resolves.toBe(true);
  expect(runtime.freshness).toHaveBeenCalledWith(true);
  expect(runtime.coordinator).toHaveBeenCalledWith('automatic', desktop);
});


it.each(['stop', 'pause', 'leave', 'lost'] as const)(
  'does not revive an activation after %s while its database access is queued', async reason => {
    runtime.requireOwner = true;
    await startDesktopSyncGroupAutoSync();
    let release!: () => void;
    const held = runWithDatabaseConnectionOwner(() => new Promise<void>(resolve => { release = resolve; }));
    let current = true;
    const activation = runtime.memberSessionArgs?.onMember(desktop, () => current);
    if (reason === 'stop') stopDesktopSyncGroupAutoSync();
    if (reason === 'pause') runtime.participating = false;
    if (reason === 'leave') runtime.group.group_id = 'other-group';
    if (reason === 'lost') {
      current = false;
      runtime.memberSessionArgs?.onMemberLost(desktop.peer_device_id);
    }
    release();
    try {
      await held;
      expect(await activation).toBe(false);
      expect(loadDesktopSyncGroupRoutes('group-1')).toEqual([]);
      expect(runtime.coordinator).not.toHaveBeenCalled();
    } finally { runtime.group.group_id = 'group-1'; }
  }
);

it('reports failed activation and permits a later member event without restarting', async () => {
  await startDesktopSyncGroupAutoSync();
  runtime.coordinator.mockRejectedValueOnce(new Error('sync failed'));
  expect(await runtime.memberSessionArgs?.onMember(desktop)).toBe(false);
  expect(loadDesktopSyncGroupDiscoveryError()).toBe('unavailable');
  expect(await runtime.memberSessionArgs?.onMember(desktop)).toBe(true);
  expect(runtime.coordinator).toHaveBeenCalledTimes(2);
});

it('does not start a discovery session after a queued startup was stopped', async () => {
  runtime.requireOwner = true;
  let release!: () => void;
  const held = runWithDatabaseConnectionOwner(() => new Promise<void>(resolve => { release = resolve; }));
  const starting = startDesktopSyncGroupAutoSync();
  stopDesktopSyncGroupAutoSync();
  release();
  await held;
  await starting;
  expect(runtime.memberSessionArgs).toBeNull();
});

it('queues recovery eligibility behind an existing database owner', async () => {
  runtime.requireOwner = true;
  await startDesktopSyncGroupAutoSync();
  let release!: () => void;
  const held = runWithDatabaseConnectionOwner(() => new Promise<void>(resolve => { release = resolve; }));
  recoverDesktopSyncGroupDiscovery();
  await Promise.resolve();
  expect(runtime.recoverMembers).not.toHaveBeenCalled();
  release();
  await held;
  await vi.waitFor(() => expect(runtime.recoverMembers).toHaveBeenCalledOnce());
});

it('keeps manual synchronization available when automatic participation is disabled', async () => {
  runtime.participating = false;
  runtime.memberEndpoints = [desktop];
  await runDesktopManualSyncWithDiscovery();
  expect(runtime.coordinator).toHaveBeenCalledWith('manual');
  expect(runtime.freshness).toHaveBeenCalledWith(false);
});
