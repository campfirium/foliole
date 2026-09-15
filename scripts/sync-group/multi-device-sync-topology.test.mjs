import { expect, it, vi } from 'vitest';

import {
  expectedDesktopSyncRole, syncDesktopMemberAfterElection
} from './multi-device-sync-topology.mjs';

function overview(localId, role, status = 'ready') {
  return { current_device: { device_identity_key: localId }, server_status: {
    topology_role: role, topology_status: status
  }, sync_group: { devices: [
    { device_identity_key: 'desktop-a', platform: 'macOS', state: 'active' },
    { device_identity_key: 'android-b', platform: 'android-capacitor', state: 'active' },
    { device_identity_key: 'desktop-c', platform: 'Windows 11', state: 'active' }
  ] } };
}

it('derives the stable role from the local active desktop list', () => {
  expect(expectedDesktopSyncRole(overview('desktop-a', 'anchor'))).toBe('anchor');
  expect(expectedDesktopSyncRole(overview('desktop-c', 'member'))).toBe('member');
});

it('waits for the expected ready role and syncs only the member', async () => {
  const loadOverview = vi.fn()
    .mockResolvedValueOnce(overview('desktop-c', 'anchor', 'observing'))
    .mockResolvedValueOnce(overview('desktop-c', 'member'));
  const sync = vi.fn(async () => ({ status: 'completed' }));
  const pause = vi.fn(async () => {});

  await expect(syncDesktopMemberAfterElection({ attempts: 2, loadOverview, pause, sync }))
    .resolves.toEqual({ status: 'completed' });
  expect(pause).toHaveBeenCalledOnce();
  expect(sync).toHaveBeenCalledOnce();
});

it('does not make the elected anchor poll a member', async () => {
  const sync = vi.fn();
  await expect(syncDesktopMemberAfterElection({ attempts: 1,
    loadOverview: async () => overview('desktop-a', 'anchor'), sync })).resolves.toBeNull();
  expect(sync).not.toHaveBeenCalled();
});
