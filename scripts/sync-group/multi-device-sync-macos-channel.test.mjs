import { expect, it, vi } from 'vitest';

import {
  closeMacosAcceptanceTransport, MACOS_ACCEPTANCE_SYNC_PORT, macosAcceptanceEnv,
  openMacosAcceptanceTransport, validateMacosAcceptanceDesktopPreflight
} from './multi-device-sync-macos-channel.mjs';

it('isolates multi-device macOS acceptance from the default product listener', async () => {
  const runAdb = vi.fn(async () => ({ code: 0 }));
  await openMacosAcceptanceTransport(runAdb);
  await closeMacosAcceptanceTransport(runAdb);
  expect(MACOS_ACCEPTANCE_SYNC_PORT).toBe('38642');
  expect(macosAcceptanceEnv({ BASE: 'kept' })).toEqual({
    BASE: 'kept', FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1',
    FOLIOLE_COMPANION_SYNC_PORT: '38642'
  });
  expect(runAdb.mock.calls).toEqual([
    [['reverse', 'tcp:38641', 'tcp:38642'], 'pair-sync-transport-open'],
    [['reverse', '--remove', 'tcp:38641'], 'pair-sync-transport-close']
  ]);
});

it('accepts only a live isolated macOS acceptance listener', () => {
  const safe = { desktopPeerFingerprint: 'desktop-peer', pairedDeviceFingerprints: [],
    pendingDeviceFingerprints: [], ready: true };
  const session = { assertActive: vi.fn(), sanitize: vi.fn(() => safe) };
  const overview = { paired_devices: [], pending_requests: [], current_host: { device_id: 'desktop-peer' },
    server_status: { port: 38642, state: 'running' }, sync_enabled: true };
  expect(validateMacosAcceptanceDesktopPreflight(
    overview, session, 'device-peer'
  )).toEqual(safe);
  expect(session.assertActive).toHaveBeenCalledOnce();
  expect(() => validateMacosAcceptanceDesktopPreflight({
    ...overview, server_status: { port: 38641, state: 'running' }
  }, session, 'device-peer')).toThrow('fixed sync listener');
});
