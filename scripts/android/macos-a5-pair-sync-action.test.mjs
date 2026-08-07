import { expect, it, vi } from 'vitest';
import fs from 'node:fs';

import {
  reconcileAuthorizedMacosDailyPairing, runMacosA5PairSync
} from './macos-a5-pair-sync-action.mjs';
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
    overview(staleId), session, 'bd1d679fbb55b53e', null, false, false, staleFingerprint
  )).resolves.toMatchObject({ pairedDeviceFingerprints: [] });
  expect(session.remove).toHaveBeenCalledWith(staleId);
});

it('removes only the fixed A5 record when current-peer credentials were rejected', async () => {
  const currentId = 'current-a5';
  const currentFingerprint = macosPairSyncIdentityFingerprint(currentId);
  const session = {
    assertActive: vi.fn(),
    remove: vi.fn(async () => overview(null)),
    sanitize: vi.fn((value) => ({
      desktopPeerFingerprint: '7f58d92331c8872b',
      pairedDeviceFingerprints: value.paired_devices.map(
        (device) => macosPairSyncIdentityFingerprint(device.device_id)
      ),
      pendingDeviceFingerprints: [], serverState: 'running', syncEnabled: true
    }))
  };

  await expect(reconcileAuthorizedMacosDailyPairing(
    overview(currentId), session, currentFingerprint, '7f58d92331c8872b', true, true
  )).resolves.toMatchObject({ pairedDeviceFingerprints: [], rePairRequired: true });
  expect(session.remove).toHaveBeenCalledWith(currentId);
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

it('authorizes exact A5 peer replacement only through the product re-pair path', async () => {
  const currentId = 'current-a5';
  const currentFingerprint = macosPairSyncIdentityFingerprint(currentId);
  const session = {
    assertActive: vi.fn(),
    remove: vi.fn(),
    sanitize: vi.fn(() => ({
      desktopPeerFingerprint: '7f58d92331c8872b',
      pairedDeviceFingerprints: [currentFingerprint],
      pendingDeviceFingerprints: [], serverState: 'running', syncEnabled: true
    }))
  };

  await expect(reconcileAuthorizedMacosDailyPairing(
    overview(currentId), session, currentFingerprint, '82cc2dc5c98135c8', true
  )).resolves.toMatchObject({ rePairRequired: true });
  expect(session.remove).not.toHaveBeenCalled();
});

it('passes the A5 trusted remote peer into desktop readiness', async () => {
  const runPairSyncRecovery = vi.fn(async (options) => options);
  const result = await runMacosA5PairSync({
    buildIdentity: 'pair-1', credentialRepairRequired: true,
    deviceFingerprint: 'device-peer', existingPairing: true,
    env: {}, evidenceRoot: '.tmp/artifacts/test-a5-pair-sync-options', execute: vi.fn(),
    paths: { adb: '/adb', repoRoot: '/repo' }, protectData: vi.fn(),
    remotePeerFingerprint: '82cc2dc5c98135c8', runPairSyncRecovery, serial: 'fixed-a5'
  });

  expect(result).toMatchObject({
    credentialRepairRequired: true, remotePeerFingerprint: '82cc2dc5c98135c8'
  });
  expect(runPairSyncRecovery).toHaveBeenCalledOnce();
});

it('does not restore the default installed desktop after the DEV-owned session', () => {
  const source = fs.readFileSync('scripts/android/macos-a5-pair-sync-action.mjs', 'utf8');
  expect(source).toContain('registered DEV restart required');
  expect(source).not.toContain("['-gj', '-a', 'Foliole']");
});
