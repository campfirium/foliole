import { pairSyncIdentityFingerprint } from './windows-pair-sync-desktop-session.mjs';
import { pairSyncRecoveryFailure } from './windows-a5-pair-sync-recovery-contract.mjs';
import { assertPairSyncRuntimeOwnership } from './windows-a5-pair-sync-recovery-transport.mjs';

function rejectPairingState() {
  throw pairSyncRecoveryFailure(
    'Windows current library pairing state requires user review',
    'desktop-pairing-readiness', null, 77
  );
}

export function validateDesktopPreflight(
  overview, session, deviceFingerprint, remotePeerFingerprint = null, existingPairing = false
) {
  const safe = session.sanitize(overview);
  const wrongPairedDevice = safe.pairedDeviceFingerprints.some((value) => value !== deviceFingerprint);
  const wrongRemotePeer = remotePeerFingerprint
    && safe.desktopPeerFingerprint !== remotePeerFingerprint;
  const missingExistingPeer = existingPairing
    && !safe.pairedDeviceFingerprints.includes(deviceFingerprint);
  if (!safe.desktopPeerFingerprint || safe.pendingDeviceFingerprints.length > 0
      || wrongPairedDevice || wrongRemotePeer || missingExistingPeer
      || safe.pairedDeviceFingerprints.length > 1) rejectPairingState();
  return safe;
}

export function validateOwnedDesktopPreflight(
  overview, session, deviceFingerprint, remotePeerFingerprint = null, existingPairing = false
) {
  assertPairSyncRuntimeOwnership(overview, session);
  return validateDesktopPreflight(
    overview, session, deviceFingerprint, remotePeerFingerprint, existingPairing
  );
}

export async function reconcileAuthorizedStalePairing(
  overview, session, deviceFingerprint, remotePeerFingerprint = null, existingPairing = false
) {
  const safe = session.sanitize(overview);
  if (!Array.isArray(overview.paired_devices)) {
    return validateDesktopPreflight(
      overview, session, deviceFingerprint, remotePeerFingerprint, existingPairing
    );
  }
  const matches = overview.paired_devices.filter(
    (device) => pairSyncIdentityFingerprint(device.device_id) === deviceFingerprint
  );
  const stale = overview.paired_devices.filter(
    (device) => pairSyncIdentityFingerprint(device.device_id) !== deviceFingerprint
  );
  const trustedBase = safe.desktopPeerFingerprint
    && safe.pendingDeviceFingerprints.length === 0
    && (!remotePeerFingerprint || safe.desktopPeerFingerprint === remotePeerFingerprint);
  const authorizedShape = overview.paired_devices.length === 2
    && ((matches.length === 1 && stale.length === 1)
      || (!existingPairing && matches.length === 0 && stale.length === 2));
  if (trustedBase && authorizedShape) {
    let reconciled = overview;
    for (const device of stale) reconciled = await session.remove(device.device_id);
    return validateDesktopPreflight(
      reconciled, session, deviceFingerprint, remotePeerFingerprint, existingPairing
    );
  }
  return validateDesktopPreflight(
    overview, session, deviceFingerprint, remotePeerFingerprint, existingPairing
  );
}
