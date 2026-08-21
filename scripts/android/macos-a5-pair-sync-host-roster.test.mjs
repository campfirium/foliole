import { expect, it, vi } from 'vitest';

import { reconcileAuthorizedMacosDailyPairing } from './macos-a5-pair-sync-action.mjs';

it('re-pairs an empty isolated store against the real host-only Sync Group roster', async () => {
  const session = {
    assertActive: vi.fn(), remove: vi.fn(),
    sanitize: vi.fn(() => ({
      desktopPeerFingerprint: '7f58d92331c8872b', pairedDeviceFingerprints: [],
      pendingDeviceFingerprints: [], serverState: 'running', syncEnabled: true
    }))
  };
  const overview = {
    current_host: { device_id: 'desktop-current' }, paired_devices: [], pending_requests: [],
    server_status: { port: 38641, state: 'running' }, sync_enabled: true,
    sync_group: {
      group_id: 'group-1', timeline_id: 'timeline-1', local_member_state: 'active',
      members: [
        { authorization_id: 'desktop-a', host_name: 'Mac', state: 'active' },
        { authorization_id: 'android-a5', host_name: 'A5', state: 'active' }
      ]
    }
  };

  await expect(reconcileAuthorizedMacosDailyPairing(
    overview, session, 'bd1d679fbb55b53e', null, false, false,
    undefined, { groupId: 'group-1', timelineId: 'timeline-1' }
  )).resolves.toMatchObject({ pairedDeviceFingerprints: [], rePairRequired: true });
  await expect(reconcileAuthorizedMacosDailyPairing(
    overview, session, 'bd1d679fbb55b53e', null, true, false,
    undefined, { groupId: 'group-1', timelineId: 'timeline-1' }
  )).resolves.toMatchObject({ pairedDeviceFingerprints: [], rePairRequired: true });
  expect(session.remove).not.toHaveBeenCalled();
});

it('rejects competing active Hosts for the same authorization', async () => {
  const session = {
    assertActive: vi.fn(), remove: vi.fn(),
    sanitize: vi.fn(() => ({ desktopPeerFingerprint: 'desktop-peer',
      pairedDeviceFingerprints: [], pendingDeviceFingerprints: [],
      serverState: 'running', syncEnabled: true }))
  };
  const overview = {
    current_host: { device_id: 'desktop-current' }, paired_devices: [], pending_requests: [],
    server_status: { port: 38641, state: 'running' }, sync_enabled: true,
    sync_group: { group_id: 'group-1', timeline_id: 'timeline-1', members: [
      { authorization_id: 'shared-authorization', host_name: 'A5', state: 'active' },
      { authorization_id: 'shared-authorization', host_name: 'A5 Renamed', state: 'active' }
    ] }
  };

  await expect(reconcileAuthorizedMacosDailyPairing(
    overview, session, 'a5-route', null, false
  )).rejects.toThrow('Host roster requires user review');
  expect(session.remove).not.toHaveBeenCalled();
});

it('rejects a Sync Group without an active Host member', async () => {
  const session = {
    assertActive: vi.fn(), remove: vi.fn(),
    sanitize: vi.fn(() => ({ desktopPeerFingerprint: 'desktop-peer',
      pairedDeviceFingerprints: [], pendingDeviceFingerprints: [],
      serverState: 'running', syncEnabled: true }))
  };
  const overview = {
    current_host: { device_id: 'desktop-current' }, paired_devices: [], pending_requests: [],
    server_status: { port: 38641, state: 'running' }, sync_enabled: true,
    sync_group: { group_id: 'group-1', timeline_id: 'timeline-1', members: [] }
  };

  await expect(reconcileAuthorizedMacosDailyPairing(
    overview, session, 'a5-route', null, false
  )).rejects.toThrow('Host roster requires user review');
  expect(session.remove).not.toHaveBeenCalled();
});
