import { pairSyncRecoveryFailure } from './pair-sync-feature-contract.mjs';
import { assertPairSyncRuntimeOwnership } from './pair-sync-transport.mjs';

function rejectPairingState() {
  throw pairSyncRecoveryFailure(
    'Current library authorization state requires user review',
    'desktop-pairing-readiness', null, 77
  );
}

function hostAuthorization(overview, hostName, collection, fingerprint) {
  const matches = (collection ?? []).filter(
    (entry) => entry.host_name === hostName && (entry.state === undefined || entry.state === 'active')
  );
  if (matches.length !== 1 || !matches[0].authorization_id) return null;
  return fingerprint(matches[0].authorization_id);
}

export function validatePairSyncDesktopPreflight({
  credentialRepairRequired = false, desktopAuthorizationFingerprint = null,
  existingPairing = false, expectedPort, fingerprint, hostName, overview,
  requireRuntime = false, session
}) {
  if (requireRuntime) assertPairSyncRuntimeOwnership(overview, session, expectedPort);
  const safe = session.sanitize(overview);
  const targetAuthorization = hostAuthorization(
    overview, hostName, overview.sync_group?.members, fingerprint
  );
  const pairedAuthorization = hostAuthorization(
    overview, hostName, overview.paired_authorizations, fingerprint
  );
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
