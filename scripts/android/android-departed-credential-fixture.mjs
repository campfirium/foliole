import { authorizationFingerprint } from './android-sync-group-authorization-inspection.mjs';
import { DEPARTED_PRESERVED_HISTORY } from './macos-a5-departed-credential-state.mjs';

export const joinedEmptyCredentialFixture = Object.freeze({
  activeSyncGroupMemberCount: 3,
  credentialRepairRequired: false,
  dirtyObjectCounts: {},
  dirtyRecordCount: 0,
  existingPairing: false,
  joinedEmptyReauthorization: true,
  hostName: 'A5',
  localMemberAuthorizationFingerprint: authorizationFingerprint('authorization-a5'),
  nodeCount: 0,
  pairingCredentialsPresent: false,
  pairingPeerAuthorizationFingerprint: null,
  pairingPeerConflict: false,
  protectedContentDigest: 'a'.repeat(64),
  storedLocalDepartureAuthorizationFingerprint: null,
  storedLocalDepartureMatchCount: 0,
  storedLocalMemberAuthorizationFingerprint: null,
  storedSyncGroupCount: 1,
  storedSyncGroupDepartureCount: 0,
  storedSyncGroupId: 'group-1',
  storedSyncGroupMemberCount: 3,
  storedSyncGroupTimelineId: 'timeline-1',
  syncGroupCredentialsPresent: true,
  syncGroupId: 'group-1',
  syncGroupPeerConflict: false,
  syncGroupRemotePeerFingerprint: authorizationFingerprint('authorization-desktop'),
  syncGroupRoutePresent: true,
  syncGroupTimelineId: 'timeline-1',
  storedAuthorizationFingerprint: null,
  workgroupKeyPresent: true,
  workspaceSyncEndpointPresent: true
});

export const departedCredentialFixture = Object.freeze({
  ...joinedEmptyCredentialFixture,
  activeSyncGroupMemberCount: 0,
  departedCredentialState: DEPARTED_PRESERVED_HISTORY,
  joinedEmptyReauthorization: false,
  localMemberAuthorizationFingerprint: null,
  storedLocalDepartureAuthorizationFingerprint: authorizationFingerprint('leave-a5'),
  storedLocalDepartureMatchCount: 1,
  storedLocalMemberAuthorizationFingerprint:
    joinedEmptyCredentialFixture.localMemberAuthorizationFingerprint,
  storedSyncGroupDepartureCount: 1,
  syncGroupCredentialsPresent: false,
  syncGroupId: null,
  syncGroupRemotePeerFingerprint: null,
  syncGroupRoutePresent: false,
  syncGroupTimelineId: null,
  workgroupKeyPresent: false
});

export const departedWorkspaceFixture = Object.freeze({
  counts: { content_blobs: 0, node_order: 0, nodes: 0 },
  pairingWorkspace: { localDeviceIdentityPresent: true, syncEndpointPresent: true }
});
