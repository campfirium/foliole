// @vitest-environment node

import { expect, it } from 'vitest';

import { parsePairSyncRecoveryReadiness } from '../sync-group/pair-sync-feature-contract.mjs';

it('keeps readiness evidence non-sensitive and fails closed', () => {
  const readiness = parsePairSyncRecoveryReadiness(
    `[android-data] pair-sync-recovery-readiness=${JSON.stringify({
      localMemberAuthorizationFingerprint: '0123456789abcdef', dirtyRecordCount: 0,
      hostName: 'A5',
      missingPrerequisites: [], nodeCount: 0, pairingCredentialsPresent: false,
      pairingCredentialRejectionReason: 'unknown_authorization', pairingCredentialsRejected: true,
      pairingPeerAuthorizationFingerprint: null, pairingPeerConflict: false,
      syncGroupCredentialsPresent: true, syncGroupPeerConflict: false,
      syncGroupRemotePeerPendingDeliveryCount: 0,
      syncGroupRemotePeerFingerprint: 'fedcba9876543210',
      resultStatus: 'ready', schemaVersion: 1, endpoint: 'must-be-dropped'
    })}`
  );
  expect(readiness).not.toHaveProperty('endpoint');
  expect(readiness).toMatchObject({
    pairingCredentialRejectionReason: 'unknown_authorization',
    pairingCredentialsRejected: true,
    resultStatus: 'ready',
    syncGroupCredentialsPresent: true,
    syncGroupPeerConflict: false,
    syncGroupRemotePeerPendingDeliveryCount: 0,
    syncGroupRemotePeerFingerprint: 'fedcba9876543210'
  });
});
