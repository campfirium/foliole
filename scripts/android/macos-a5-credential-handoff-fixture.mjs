export const credentialHandoffRevision = 'a'.repeat(40);

export const credentialsSignableReadinessFixture = Object.freeze({
  activeSyncGroupMemberCount: 3,
  credentialRepairRequired: false,
  deviceIdentityFingerprint: '2fdd44bb500a5934',
  existingPairing: true,
  pairingCredentialsPresent: true,
  pairingPeerConflict: false,
  pairTargetPeerFingerprint: '82cc2dc5c98135c8',
  remotePeerFingerprint: '82cc2dc5c98135c8',
  syncGroupId: 'group-1',
  syncGroupRemotePeerFingerprint: '82cc2dc5c98135c8',
  syncGroupPeerConflict: false,
  syncGroupRoutePresent: true,
  syncGroupTimelineId: 'timeline-1',
  workgroupKeyPresent: true,
  workspaceSyncEndpointPresent: true
});

export const credentialsSignableReceiptFixture = Object.freeze({
  credentials: 'saved_signable',
  initialSync: 'not_started',
  pairingPath: 'new'
});

export const credentialsSignableManifestFixture = Object.freeze({
  action: 'pair-sync-recover',
  buildIdentity: 'build-credentials',
  deviceIdentityFingerprint: credentialsSignableReadinessFixture.deviceIdentityFingerprint,
  resultStatus: 'success',
  schemaVersion: 1
});
