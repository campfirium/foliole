// @vitest-environment node

import { expect, it } from 'vitest';

import { parsePairSyncRecoveryReadiness } from './windows-a5-pair-sync-recovery-contract.mjs';

it('keeps readiness evidence non-sensitive and fails closed', () => {
  const readiness = parsePairSyncRecoveryReadiness(
    `[android-data] pair-sync-recovery-readiness=${JSON.stringify({
      deviceIdentityFingerprint: '0123456789abcdef', dirtyRecordCount: 0,
      missingPrerequisites: [], nodeCount: 0, pairingCredentialsPresent: false,
      pairingCredentialRejectionReason: 'unknown_device', pairingCredentialsRejected: true,
      pairingPeerConflict: false, remotePeerFingerprint: null,
      resultStatus: 'ready', schemaVersion: 1, endpoint: 'must-be-dropped'
    })}`
  );
  expect(readiness).not.toHaveProperty('endpoint');
  expect(readiness).toMatchObject({
    pairingCredentialRejectionReason: 'unknown_device',
    pairingCredentialsRejected: true,
    resultStatus: 'ready'
  });
});
