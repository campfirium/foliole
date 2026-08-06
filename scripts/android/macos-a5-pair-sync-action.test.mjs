import { expect, it, vi } from 'vitest';

import { reconcileAuthorizedMacosDailyPairing } from './macos-a5-pair-sync-action.mjs';
import { macosPairSyncIdentityFingerprint } from './macos-pair-sync-desktop-session.mjs';

function overview(deviceId) {
  return {
    paired_devices: deviceId ? [{ device_id: deviceId }] : [],
    pending_requests: [],
    primary_device_state: { local_role: 'primary', primary_device_id: 'desktop-current' },
    server_status: { port: 38641, state: 'running' },
    sync_enabled: true
  };
}

it('removes only the explicitly authorized stale daily DEV pairing', async () => {
  const staleId = 'stale-daily-device';
  const staleFingerprint = macosPairSyncIdentityFingerprint(staleId);
  const session = {
    assertActive: vi.fn(),
    remove: vi.fn(async () => overview(null)),
    sanitize: vi.fn((value) => ({
      desktopPeerFingerprint: '7f58d92331c8872b',
      pairedDeviceFingerprints: value.paired_devices.map(() => staleFingerprint),
      pendingDeviceFingerprints: [],
      serverState: 'running',
      syncEnabled: true
    }))
  };

  await expect(reconcileAuthorizedMacosDailyPairing(
    overview(staleId), session, 'bd1d679fbb55b53e', null, false, staleFingerprint
  )).resolves.toMatchObject({ pairedDeviceFingerprints: [] });
  expect(session.remove).toHaveBeenCalledWith(staleId);
});

it('passes an authorized existing pairing through without removing it', async () => {
  const currentId = 'current-a5';
  const currentFingerprint = macosPairSyncIdentityFingerprint(currentId);
  const session = {
    assertActive: vi.fn(),
    remove: vi.fn(),
    sanitize: vi.fn(() => ({
      desktopPeerFingerprint: '7f58d92331c8872b',
      pairedDeviceFingerprints: [currentFingerprint],
      pendingDeviceFingerprints: [],
      serverState: 'running',
      syncEnabled: true
    }))
  };

  await expect(reconcileAuthorizedMacosDailyPairing(
    overview(currentId), session, currentFingerprint, null, true
  )).resolves.toMatchObject({ pairedDeviceFingerprints: [currentFingerprint] });
  expect(session.remove).not.toHaveBeenCalled();
});
