/* global process */

import { validateDesktopPreflight } from '../windows/windows-pair-sync-desktop-readiness.mjs';
import {
  assertPairSyncRuntimeOwnership, closePairSyncRecoveryTransport,
  openPairSyncRecoveryTransport, PAIR_SYNC_PORT
} from '../windows/windows-a5-pair-sync-recovery-transport.mjs';

export const MACOS_ACCEPTANCE_SYNC_PORT = '38642';

export function macosAcceptanceEnv(env = process.env) {
  return { ...env, FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1',
    FOLIOLE_COMPANION_SYNC_PORT: MACOS_ACCEPTANCE_SYNC_PORT };
}

export function macosAcceptanceSessionOptions(options) {
  return { ...options, env: macosAcceptanceEnv(options.env) };
}

export function validateMacosAcceptanceDesktopPreflight(
  overview, session, hostName, desktopAuthorizationFingerprint = null,
  existingPairing = false
) {
  assertPairSyncRuntimeOwnership(overview, session, MACOS_ACCEPTANCE_SYNC_PORT);
  return validateDesktopPreflight(
    overview, session, hostName, desktopAuthorizationFingerprint, existingPairing
  );
}

export function openMacosAcceptanceTransport(runAdb) {
  return openPairSyncRecoveryTransport(runAdb, {
    devicePort: PAIR_SYNC_PORT, hostPort: MACOS_ACCEPTANCE_SYNC_PORT
  });
}

export function closeMacosAcceptanceTransport(runAdb) {
  return closePairSyncRecoveryTransport(runAdb, { devicePort: PAIR_SYNC_PORT });
}
