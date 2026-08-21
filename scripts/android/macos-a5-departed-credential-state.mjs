export const DEPARTED_PRESERVED_HISTORY = 'departed_preserved_history';

function fingerprint(value) {
  return /^[0-9a-f]{16}$/u.test(value ?? '');
}

export function classifyDepartedCredentialState(pairState, workspaceState) {
  const emptyContent = pairState.nodeCount === 0 && pairState.dirtyRecordCount === 0
    && workspaceState.counts?.nodes === 0 && workspaceState.counts?.content_blobs === 0
    && workspaceState.counts?.node_order === 0;
  const exact = pairState.activeSyncGroupMemberCount === 0
    && pairState.syncGroupId === null && pairState.syncGroupTimelineId === null
    && pairState.storedSyncGroupCount === 1
    && typeof pairState.storedSyncGroupId === 'string'
    && typeof pairState.storedSyncGroupTimelineId === 'string'
    && pairState.storedSyncGroupMemberCount > 1
    && pairState.storedSyncGroupDepartureCount > 0
    && pairState.storedLocalDepartureMatchCount === 1
    && fingerprint(pairState.storedLocalMemberAuthorizationFingerprint)
    && fingerprint(pairState.storedLocalDepartureAuthorizationFingerprint)
    && pairState.pairingCredentialsPresent === false
    && pairState.pairingPeerAuthorizationFingerprint === null
    && pairState.pairingPeerConflict === false && pairState.syncGroupCredentialsPresent === false
    && pairState.workgroupKeyPresent === false && pairState.syncGroupRoutePresent === false
    && pairState.syncGroupPeerConflict === false
    && pairState.syncGroupRemotePeerFingerprint === null
    && pairState.workspaceSyncEndpointPresent === true
    && workspaceState.pairingWorkspace?.syncEndpointPresent === true && emptyContent;
  return exact ? DEPARTED_PRESERVED_HISTORY : null;
}

export function assertDepartedCredentialBaseline(readiness, baseline = readiness) {
  const preserved = readiness.departedCredentialState === DEPARTED_PRESERVED_HISTORY
    && readiness.nodeCount === baseline.nodeCount
    && readiness.dirtyRecordCount === baseline.dirtyRecordCount
    && readiness.protectedContentDigest === baseline.protectedContentDigest
    && JSON.stringify(readiness.dirtyObjectCounts ?? {})
      === JSON.stringify(baseline.dirtyObjectCounts ?? {})
    && readiness.storedSyncGroupId === (baseline.groupId ?? baseline.storedSyncGroupId)
    && readiness.storedSyncGroupTimelineId === (baseline.timelineId
      ?? baseline.storedSyncGroupTimelineId)
    && readiness.storedLocalMemberAuthorizationFingerprint
      === (baseline.localMemberAuthorizationFingerprint
        ?? baseline.storedLocalMemberAuthorizationFingerprint);
  if (!preserved) throw new Error('Product Leave did not preserve the exact departed credential baseline.');
  return readiness;
}
