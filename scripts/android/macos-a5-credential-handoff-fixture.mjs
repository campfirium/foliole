import { authorizationFingerprint } from './android-sync-group-authorization-inspection.mjs';

export const credentialHandoffRevision = 'a'.repeat(40);

export const credentialsSignableReadinessFixture = Object.freeze({
  activeSyncGroupMemberCount: 3,
  credentialRepairRequired: false,
  existingPairing: true,
  hostName: 'A5',
  localMemberAuthorizationFingerprint: authorizationFingerprint('authorization-a5'),
  pairingCredentialsPresent: true,
  pairingPeerConflict: false,
  pairingPeerAuthorizationFingerprint: '82cc2dc5c98135c8',
  pairTargetAuthorizationFingerprint: '82cc2dc5c98135c8',
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
  localAuthorizationFingerprint:
    credentialsSignableReadinessFixture.localMemberAuthorizationFingerprint,
  resultStatus: 'success',
  schemaVersion: 1
});
