/* global process */

import {
  macosPairSyncAuthorizationFingerprint
} from '../android/macos-pair-sync-desktop-session.mjs';
import { validatePairSyncDesktopPreflight } from './pair-sync-desktop-preflight.mjs';
import {
  closePairSyncRecoveryTransport, openPairSyncRecoveryTransport, PAIR_SYNC_PORT
} from './pair-sync-transport.mjs';

export const MACOS_ACCEPTANCE_SYNC_PORT = '38642';

export function macosAcceptanceEnv(env = process.env) {
  return { ...env, FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1',
    FOLIOLE_COMPANION_SYNC_PORT: MACOS_ACCEPTANCE_SYNC_PORT };
}

export function macosAcceptanceSessionOptions(options) {
  return { ...options, env: macosAcceptanceEnv(options.env) };
}

export function assertMacosAcceptanceSyncGroupServer(overview) {
  const status = overview?.server_status;
  if (status?.state !== 'running'
      || String(status.port) !== MACOS_ACCEPTANCE_SYNC_PORT) {
    throw Object.assign(new Error('Mac acceptance sync listener is unavailable.'), {
      serverStatus: status ?? null
    });
  }
  return overview;
}

export function validateMacosAcceptanceDesktopPreflight(
  overview, session, hostName, desktopAuthorizationFingerprint = null,
  existingPairing = false
) {
  return validatePairSyncDesktopPreflight({ desktopAuthorizationFingerprint,
    existingPairing, expectedPort: MACOS_ACCEPTANCE_SYNC_PORT,
    fingerprint: macosPairSyncAuthorizationFingerprint, hostName, overview,
    requireRuntime: true, session });
}

export function openMacosAcceptanceTransport(runAdb) {
  return openPairSyncRecoveryTransport(runAdb, {
    devicePort: PAIR_SYNC_PORT, hostPort: MACOS_ACCEPTANCE_SYNC_PORT
  });
}

export function closeMacosAcceptanceTransport(runAdb) {
  return closePairSyncRecoveryTransport(runAdb, { devicePort: PAIR_SYNC_PORT });
}
