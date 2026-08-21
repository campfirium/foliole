import {
  pairSyncAuthorizationFingerprint
} from './windows-pair-sync-desktop-session.mjs';
import { pairSyncRecoveryFailure } from './windows-a5-pair-sync-recovery-contract.mjs';
import { assertPairSyncRuntimeOwnership } from './windows-a5-pair-sync-recovery-transport.mjs';

function rejectPairingState() {
  throw pairSyncRecoveryFailure(
    'Windows current library authorization state requires user review',
    'desktop-pairing-readiness', null, 77
  );
}

function activeHostAuthorizationFingerprint(overview, hostName) {
  const matches = (overview.sync_group?.members ?? []).filter(
    (member) => member.state === 'active' && member.host_name === hostName
  );
  if (matches.length !== 1 || !matches[0].authorization_id) return null;
  return pairSyncAuthorizationFingerprint(matches[0].authorization_id);
}

function pairedHostAuthorizationFingerprint(overview, hostName) {
  const matches = (overview.paired_authorizations ?? []).filter(
    (authorization) => authorization.host_name === hostName
  );
  if (matches.length !== 1 || !matches[0].authorization_id) return null;
  return pairSyncAuthorizationFingerprint(matches[0].authorization_id);
}

export function validateDesktopPreflight(
  overview, session, hostName, desktopAuthorizationFingerprint = null,
  existingPairing = false, credentialRepairRequired = false
) {
  const safe = session.sanitize(overview);
  const targetAuthorization = activeHostAuthorizationFingerprint(overview, hostName);
  const pairedAuthorization = pairedHostAuthorizationFingerprint(overview, hostName);
  const trustedBase = typeof hostName === 'string' && Boolean(hostName.trim())
    && safe.localAuthorizationFingerprint
    && safe.pendingAuthorizationFingerprints.length === 0
    && (!desktopAuthorizationFingerprint
      || safe.localAuthorizationFingerprint === desktopAuthorizationFingerprint)
    && credentialRepairRequired !== true;
  const targetState = existingPairing
    ? Boolean(targetAuthorization && pairedAuthorization === targetAuthorization)
    : !targetAuthorization && !pairedAuthorization;
  if (!trustedBase || !targetState) rejectPairingState();
  return { ...safe, rePairRequired: !existingPairing };
}

export function validateOwnedDesktopPreflight(...args) {
  assertPairSyncRuntimeOwnership(args[0], args[1]);
  return validateDesktopPreflight(...args);
}

export async function inspectAuthorizedDesktopPreflight(
  overview, session, hostName, desktopAuthorizationFingerprint = null,
  existingPairing = false
) {
  return validateDesktopPreflight(
    overview, session, hostName, desktopAuthorizationFingerprint, existingPairing
  );
}
