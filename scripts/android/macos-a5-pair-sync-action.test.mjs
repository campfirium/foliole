// @vitest-environment node
/* global AbortController */

import { expect, it, vi } from 'vitest';

import {
  macosPairSyncAuthorizationFingerprint
} from './macos-pair-sync-desktop-session.mjs';
import {
  reconcileAuthorizedMacosDailyPairing,
  runMacosA5PairSync
} from './macos-a5-pair-sync-action.mjs';

const desktopAuthorization = 'authorization-desktop';
const a5Authorization = 'authorization-a5';

function overview({ includeA5 = true, includeRoute = true } = {}) {
  return {
    paired_authorizations: includeRoute ? [{
      authorization_id: a5Authorization, host_name: 'A5', host_platform: 'android-capacitor'
    }] : [],
    pending_requests: [],
    server_status: { port: 38641, state: 'running' },
    sync_enabled: true,
    sync_group: {
      group_id: 'group-1', local_host_name: 'Desktop', timeline_id: 'timeline-1',
      members: [
        { authorization_id: desktopAuthorization, host_name: 'Desktop', state: 'active' },
        ...(includeA5
          ? [{ authorization_id: a5Authorization, host_name: 'A5', state: 'active' }]
          : [])
      ]
    }
  };
}

function session(value) {
  return {
    assertActive: vi.fn(),
    sanitize: vi.fn(() => ({
      localAuthorizationFingerprint:
        macosPairSyncAuthorizationFingerprint(desktopAuthorization),
      pairedAuthorizationFingerprints: value.paired_authorizations.map(
        (authorization) => macosPairSyncAuthorizationFingerprint(
          authorization.authorization_id
        )
      ),
      pendingAuthorizationFingerprints: [], serverState: 'running', syncEnabled: true
    }))
  };
}

it('accepts an existing A5 credential route only when it matches the Host authorization', async () => {
  const value = overview();
  await expect(reconcileAuthorizedMacosDailyPairing(
    value, session(value), 'A5',
    macosPairSyncAuthorizationFingerprint(desktopAuthorization), true
  )).resolves.toMatchObject({
    pairedAuthorizationFingerprints: [
      macosPairSyncAuthorizationFingerprint(a5Authorization)
    ], rePairRequired: false
  });
});

it('accepts a fresh A5 join only when membership and credential route are absent', async () => {
  const value = overview({ includeA5: false, includeRoute: false });
  await expect(reconcileAuthorizedMacosDailyPairing(
    value, session(value), 'A5',
    macosPairSyncAuthorizationFingerprint(desktopAuthorization), false
  )).resolves.toMatchObject({ pairedAuthorizationFingerprints: [], rePairRequired: true });
});

it('keeps the authorized member route while requesting credential repair', async () => {
  const value = overview();
  await expect(reconcileAuthorizedMacosDailyPairing(
    value, session(value), 'A5',
    macosPairSyncAuthorizationFingerprint(desktopAuthorization), true, true
  )).resolves.toMatchObject({ rePairRequired: true });
});

it('rejects Host ambiguity and protected group drift', async () => {
  const value = overview();
  value.sync_group.members.push({
    authorization_id: 'authorization-a5-duplicate', host_name: 'A5', state: 'active'
  });
  await expect(reconcileAuthorizedMacosDailyPairing(
    value, session(value), 'A5',
    macosPairSyncAuthorizationFingerprint(desktopAuthorization), true
  )).rejects.toThrow('Host roster');

  value.sync_group.members.pop();
  await expect(reconcileAuthorizedMacosDailyPairing(
    value, session(value), 'A5',
    macosPairSyncAuthorizationFingerprint(desktopAuthorization), true, false,
    { groupId: 'different-group', timelineId: 'timeline-1' }
  )).rejects.toThrow('Sync Group identity');
});

it('forwards only Host and authorization routing to the shared recovery action', async () => {
  const runPairSyncRecovery = vi.fn(async (args) => args);
  const openDesktopSession = vi.fn(async (options) => options);
  const result = await runMacosA5PairSync({
    approvalRequired: true, buildIdentity: 'build-1', credentialRepairRequired: false,
    desktopAuthorizationFingerprint: '82cc2dc5c98135c8', env: {},
    evidenceRoot: '.tmp/evidence', execute: vi.fn(), existingPairing: false,
    hostName: 'A5', pairedAuthorizationFingerprint: null, pairRequestIdentity: 'A5',
    openDesktopSession,
    paths: { adb: '/adb', buildRoot: '/repo', desktopDevLibrary: '/controller-library',
      desktopRuntimeRoot: '/runtime' }, runPairSyncRecovery, serial: 'fixed-a5'
  });

  expect(result).toMatchObject({
    approvalRequired: true,
    desktopAuthorizationFingerprint: '82cc2dc5c98135c8', hostName: 'A5',
    pairedAuthorizationFingerprint: null, pairRequestIdentity: 'A5'
  });
  expect(result).not.toHaveProperty('deviceFingerprint');
  expect(result).not.toHaveProperty('pairedDeviceFingerprint');
  await result.openDesktopSession({ env: {}, repoRoot: '/repo' });
  expect(openDesktopSession).toHaveBeenCalledWith(expect.objectContaining({
    libraryHome: '/controller-library', runtimeRoot: '/runtime'
  }));

  const recoveryWindow = {
    deadline: Date.now() + 180_000,
    signal: new AbortController().signal,
  };
  const load = vi.fn(async () => ({ pending_requests: [{
    host_name: 'A5', pair_request_id: 'pair-1'
  }] }));
  await expect(result.waitForPairRequest({ load }, 'A5', recoveryWindow))
    .resolves.toMatchObject({ pair_request_id: 'pair-1' });
});

it('keeps an action-local hidden credential session when the controller owns one', async () => {
  const runPairSyncRecovery = vi.fn(async (args) => args);
  const openDesktopSession = vi.fn(async (options) => options);
  const result = await runMacosA5PairSync({
    buildIdentity: 'build-1', credentialRepairRequired: false, env: {},
    evidenceRoot: '.tmp/evidence', execute: vi.fn(), existingPairing: false,
    hostName: 'A5', openDesktopSession,
    paths: { adb: '/adb', buildRoot: '/repo', desktopDevLibrary: '/controller-library',
      desktopRuntimeRoot: '/daily-runtime' },
    runPairSyncRecovery, runtimeRoot: '/owned-run', serial: 'fixed-a5'
  });

  await result.openDesktopSession({ env: {}, repoRoot: '/repo' });
  expect(openDesktopSession).toHaveBeenCalledWith(expect.objectContaining({
    libraryHome: '/controller-library', runtimeRoot: '/owned-run'
  }));
});
