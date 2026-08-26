import { expect, it, vi } from 'vitest';

import {
  assertMacosAcceptanceSyncGroupServer, closeMacosAcceptanceTransport,
  MACOS_ACCEPTANCE_SYNC_PORT, macosAcceptanceEnv, openMacosAcceptanceTransport,
  validateMacosAcceptanceDesktopPreflight
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

it('short-circuits before a Device journey when the isolated listener is unavailable', () => {
  const running = { server_status: { last_error: null, port: 38642, state: 'running' } };
  expect(assertMacosAcceptanceSyncGroupServer(running)).toBe(running);
  expect(() => assertMacosAcceptanceSyncGroupServer({ server_status: {
    last_error: 'listen EADDRINUSE', port: null, state: 'failed'
  } })).toThrow('Mac acceptance sync listener is unavailable.');
});

it('accepts only a live isolated macOS acceptance listener', () => {
  const safe = { localAuthorizationFingerprint: 'desktop-authorization',
    pairedAuthorizationFingerprints: [], pendingAuthorizationFingerprints: [], ready: true };
  const session = { assertActive: vi.fn(), sanitize: vi.fn(() => safe) };
  const overview = { paired_authorizations: [], pending_requests: [],
    server_status: { port: 38642, state: 'running' }, sync_enabled: true,
    sync_group: { local_host_name: 'Mac', members: [{
      authorization_id: 'desktop-authorization', host_name: 'Mac', state: 'active'
    }] } };
  expect(validateMacosAcceptanceDesktopPreflight(
    overview, session, 'A5'
  )).toEqual({ ...safe, rePairRequired: true });
  expect(session.assertActive).toHaveBeenCalledOnce();
  expect(() => validateMacosAcceptanceDesktopPreflight({
    ...overview, server_status: { port: 38641, state: 'running' }
  }, session, 'A5')).toThrow('fixed sync listener');
});
