import {
  validatePairSyncDesktopPreflight
} from '../sync-group/pair-sync-desktop-preflight.mjs';
import {
  pairSyncAuthorizationFingerprint
} from './windows-pair-sync-desktop-session.mjs';

export function validateDesktopPreflight(
  overview, session, hostName, desktopAuthorizationFingerprint = null,
  existingPairing = false, credentialRepairRequired = false
) {
  return validatePairSyncDesktopPreflight({ credentialRepairRequired,
    desktopAuthorizationFingerprint, existingPairing,
    fingerprint: pairSyncAuthorizationFingerprint, hostName, overview, session });
}

export function validateOwnedDesktopPreflight(...args) {
  const [overview, session, hostName, desktopAuthorizationFingerprint = null,
    existingPairing = false, credentialRepairRequired = false] = args;
  return validatePairSyncDesktopPreflight({ credentialRepairRequired,
    desktopAuthorizationFingerprint, existingPairing,
    fingerprint: pairSyncAuthorizationFingerprint, hostName, overview,
    requireRuntime: true, session });
}

export async function inspectAuthorizedDesktopPreflight(
  overview, session, hostName, desktopAuthorizationFingerprint = null,
  existingPairing = false
) {
  return validateDesktopPreflight(
    overview, session, hostName, desktopAuthorizationFingerprint, existingPairing
  );
}
