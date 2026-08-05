// @vitest-environment node

import { expect, it, vi } from 'vitest';

import { inspectWindowsPairSyncRecoveryDesktop } from './windows-a5-pair-sync-recovery-action.mjs';
import { pairSyncIdentityFingerprint } from './windows-pair-sync-desktop-session.mjs';

const paths = { repoRoot: 'C:\\repo', systemNode: 'C:\\Program Files\\nodejs\\node.exe' };
const execute = vi.fn(async () => ({ code: 0, output: '', stdout: '' }));

function unsafeSession(close = vi.fn(async () => undefined)) {
  return {
    close,
    load: vi.fn(async () => ({})),
    sanitize: vi.fn(() => ({
      desktopPeerFingerprint: null, pairedDeviceFingerprints: [], pendingDeviceFingerprints: []
    }))
  };
}

function duplicateSession() {
  const current = 'current-a5';
  const stale = 'stale-a5';
  let pairedDevices = [{ device_id: current }, { device_id: stale }];
  const session = {
    close: vi.fn(async () => undefined),
    load: vi.fn(async () => ({ paired_devices: pairedDevices, pending_requests: [] })),
    remove: vi.fn(async (deviceId) => {
      pairedDevices = pairedDevices.filter((device) => device.device_id !== deviceId);
      return { paired_devices: pairedDevices, pending_requests: [] };
    }),
    sanitize: vi.fn((value) => ({
      desktopPeerFingerprint: 'desktop-peer',
      pairedDeviceFingerprints: value.paired_devices.map((device) =>
        pairSyncIdentityFingerprint(device.device_id)),
      pendingDeviceFingerprints: []
    }))
  };
  return { current, session, stale };
}

it('preserves pairing approval evidence when bounded session cleanup also fails', async () => {
  const session = unsafeSession(vi.fn(async () => { throw new Error('close failed'); }));
  await expect(inspectWindowsPairSyncRecoveryDesktop({
    deviceFingerprint: '0123456789abcdef', env: {}, execute,
    openDesktopSession: vi.fn(async () => session), paths
  })).rejects.toMatchObject({ exitCode: 77, stage: 'desktop-pairing-readiness' });
});

it('classifies a standalone bounded session cleanup failure', async () => {
  const session = unsafeSession(vi.fn(async () => { throw new Error('close failed'); }));
  session.sanitize.mockReturnValue({
    desktopPeerFingerprint: 'fedcba9876543210', pairedDeviceFingerprints: [], pendingDeviceFingerprints: []
  });
  await expect(inspectWindowsPairSyncRecoveryDesktop({
    deviceFingerprint: '0123456789abcdef', env: {}, execute,
    openDesktopSession: vi.fn(async () => session), paths
  })).rejects.toMatchObject({ exitCode: 74, stage: 'desktop-session-close' });
});

it('classifies a product pairing overview read failure without exposing its payload', async () => {
  const session = unsafeSession();
  session.load.mockRejectedValue(new Error('bridge read failed'));
  await expect(inspectWindowsPairSyncRecoveryDesktop({
    deviceFingerprint: '0123456789abcdef', env: {}, execute,
    openDesktopSession: vi.fn(async () => session), paths
  })).rejects.toMatchObject({ exitCode: 74, stage: 'desktop-pairing-load' });
});

it('removes only one authorized stale identity while preserving the fixed A5 pairing', async () => {
  const fixture = duplicateSession();
  await expect(inspectWindowsPairSyncRecoveryDesktop({
    deviceFingerprint: pairSyncIdentityFingerprint(fixture.current), env: {}, execute,
    openDesktopSession: vi.fn(async () => fixture.session), paths
  })).resolves.toMatchObject({
    overview: { pairedDeviceFingerprints: [pairSyncIdentityFingerprint(fixture.current)] }
  });
  expect(fixture.session.remove).toHaveBeenCalledOnce();
  expect(fixture.session.remove).toHaveBeenCalledWith(fixture.stale);
});

it('removes both authorized stale identities when the fixed A5 has no pairing', async () => {
  const fixture = duplicateSession();
  await expect(inspectWindowsPairSyncRecoveryDesktop({
    deviceFingerprint: pairSyncIdentityFingerprint('fresh-a5'), env: {}, execute,
    existingPairing: false, openDesktopSession: vi.fn(async () => fixture.session), paths
  })).resolves.toMatchObject({ overview: { pairedDeviceFingerprints: [] } });
  expect(fixture.session.remove).toHaveBeenCalledTimes(2);
  expect(fixture.session.remove).toHaveBeenNthCalledWith(1, fixture.current);
  expect(fixture.session.remove).toHaveBeenNthCalledWith(2, fixture.stale);
});

it('keeps ambiguous pairing sets unchanged', async () => {
  const fixture = duplicateSession();
  fixture.session.load.mockResolvedValue({
    paired_devices: [
      { device_id: fixture.current }, { device_id: fixture.stale }, { device_id: 'another-stale-a5' }
    ],
    pending_requests: []
  });
  await expect(inspectWindowsPairSyncRecoveryDesktop({
    deviceFingerprint: pairSyncIdentityFingerprint(fixture.current), env: {}, execute,
    openDesktopSession: vi.fn(async () => fixture.session), paths
  })).rejects.toMatchObject({ exitCode: 77, stage: 'desktop-pairing-readiness' });
  expect(fixture.session.remove).not.toHaveBeenCalled();
});
