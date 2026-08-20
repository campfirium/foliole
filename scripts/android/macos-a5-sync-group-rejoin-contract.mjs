import { createHash } from 'node:crypto';

import { assertPairSyncRuntimeOwnership } from '../windows/windows-a5-pair-sync-recovery-transport.mjs';
import { macosPairSyncIdentityFingerprint } from './macos-pair-sync-desktop-session.mjs';
import { hasCompleteDirtyStateEvidence } from './macos-a5-pending-sync-state.mjs';

export const T132_A5_IDENTITY = '2fdd44bb500a5934';
export const T132_A5_LEGACY_MEMBER_IDENTITY = 'bff1f41963a42739';
export const T132_GROUP_ID = 'group-59a8fdf1-a4e6-48aa-ad50-b68a8a0dcddf';
export const T132_MAC_IDENTITY = 'a8ef578b118115cf';
export const T132_OFFLINE_IDENTITY = '512bececd879ce0f';
export const T132_TIMELINE_ID = 'timeline-73042308-acdf-49d7-8ccd-2c5e4656aee9';

function activeMemberFingerprints(overview) {
  return (overview.sync_group?.members ?? [])
    .filter(({ state }) => state === 'active')
    .map(({ device_id: id }) => macosPairSyncIdentityFingerprint(id))
    .sort();
}

export function assertT132ProtectedBaseline(readiness, requireSettledDelivery = true) {
  const protectedIdentity = readiness.deviceIdentityFingerprint === T132_A5_IDENTITY
    || readiness.deviceIdentityFingerprint === T132_A5_LEGACY_MEMBER_IDENTITY;
  if (!protectedIdentity
      || readiness.syncGroupId !== T132_GROUP_ID
      || readiness.syncGroupTimelineId !== T132_TIMELINE_ID
      || readiness.activeSyncGroupMemberCount !== 3
      || readiness.nodeCount < 1399
      || readiness.syncGroupCredentialsPresent !== true
      || !hasCompleteDirtyStateEvidence(readiness)
      || readiness.syncGroupRemotePeerFingerprint !== T132_MAC_IDENTITY
      || readiness.syncGroupPeerConflict === true
      || (requireSettledDelivery && readiness.syncGroupRemotePeerPendingDeliveryCount !== 0)) {
    throw new Error('Fixed A5 no longer matches the protected T132-2 terminal baseline.');
  }
  return readiness;
}

export function assertT132CredentialRecoveryBaseline(readiness) {
  const peerCounts = readiness.currentDeliveryStatusCountsByPeerFingerprint ?? {};
  if (readiness.deviceIdentityFingerprint !== T132_A5_IDENTITY
      || (readiness.syncGroupId ?? readiness.storedSyncGroupId) !== T132_GROUP_ID
      || (readiness.syncGroupTimelineId ?? readiness.storedSyncGroupTimelineId) !== T132_TIMELINE_ID
      || readiness.activeSyncGroupMemberCount !== 3
      || readiness.nodeCount < 1399
      || readiness.syncGroupCredentialsPresent === true
      || !hasCompleteDirtyStateEvidence(readiness)
      || readiness.syncGroupRemotePeerFingerprint !== null
      || readiness.syncGroupPeerConflict === true
      || (peerCounts[T132_MAC_IDENTITY]?.accepted ?? 0) < 1) {
    throw new Error('Fixed A5 no longer matches the protected credential recovery baseline.');
  }
  return readiness;
}

export function assertT132MacBaseline(overview, session) {
  assertPairSyncRuntimeOwnership(overview, session);
  const safe = session.sanitize(overview);
  const members = activeMemberFingerprints(overview);
  const a5Identity = members.includes(T132_A5_LEGACY_MEMBER_IDENTITY)
    ? T132_A5_LEGACY_MEMBER_IDENTITY : T132_A5_IDENTITY;
  const expected = [a5Identity, T132_MAC_IDENTITY, T132_OFFLINE_IDENTITY].sort();
  const paired = a5Identity === T132_A5_LEGACY_MEMBER_IDENTITY ? [a5Identity] : [];
  if (overview.sync_group?.group_id !== T132_GROUP_ID
      || overview.sync_group.timeline_id !== T132_TIMELINE_ID
      || JSON.stringify(members) !== JSON.stringify(expected)
      || safe.desktopPeerFingerprint !== T132_MAC_IDENTITY
      || JSON.stringify(safe.pairedDeviceFingerprints) !== JSON.stringify(paired)
      || safe.pendingDeviceFingerprints.length !== 0) {
    throw new Error('Mac no longer matches the protected three-member Sync Group baseline.');
  }
  const a5 = overview.sync_group.members.find(
    ({ device_id: id }) => macosPairSyncIdentityFingerprint(id) === a5Identity
  );
  if (!a5?.authorization_id) throw new Error('Protected A5 member authorization is missing.');
  return { oldAuthorizationId: a5.authorization_id, protectedMemberIdentity: a5Identity };
}

export function validateT132CredentialRecoveryDesktop(
  overview, session, deviceFingerprint, remotePeerFingerprint, existingPairing
) {
  const member = assertT132MacBaseline(overview, session);
  if (deviceFingerprint !== T132_A5_IDENTITY || remotePeerFingerprint !== T132_MAC_IDENTITY
      || existingPairing !== false) {
    throw new Error('Mac does not expose the fixed A5 credential recovery boundary.');
  }
  return { ...session.sanitize(overview), ...member, rePairRequired: true };
}

export function assertT132UnboundAfterRestart(readiness, baseline) {
  if (readiness.deviceIdentityFingerprint !== T132_A5_IDENTITY
      || readiness.nodeCount !== baseline.nodeCount
      || readiness.protectedContentDigest !== baseline.protectedContentDigest
      || readiness.syncGroupId !== null || readiness.syncGroupTimelineId !== null
      || readiness.syncGroupCredentialsPresent === true
      || readiness.syncGroupRemotePeerFingerprint !== null
      || readiness.dirtyRecordCount !== baseline.dirtyRecordCount
      || JSON.stringify(readiness.dirtyObjectCounts) !== JSON.stringify(baseline.dirtyObjectCounts)
      || Object.keys(readiness.currentDeliveryStatusCountsByPeerFingerprint ?? {}).length !== 0) {
    throw new Error('Restarted A5 retained obsolete Sync Group authority or lost protected data.');
  }
  return readiness;
}

export function validateT132DepartedMemberDesktop(
  overview, session, deviceFingerprint, remotePeerFingerprint, existingPairing
) {
  assertPairSyncRuntimeOwnership(overview, session);
  const safe = session.sanitize(overview);
  const expected = [T132_MAC_IDENTITY, T132_OFFLINE_IDENTITY].sort();
  if (deviceFingerprint !== T132_A5_IDENTITY || remotePeerFingerprint !== T132_MAC_IDENTITY
      || existingPairing !== false || overview.sync_group?.group_id !== T132_GROUP_ID
      || overview.sync_group.timeline_id !== T132_TIMELINE_ID
      || JSON.stringify(activeMemberFingerprints(overview)) !== JSON.stringify(expected)
      || safe.desktopPeerFingerprint !== T132_MAC_IDENTITY
      || safe.pairedDeviceFingerprints.length !== 0
      || safe.pendingDeviceFingerprints.length !== 0) {
    throw new Error('Mac does not expose the exact departed-member rejoin boundary.');
  }
  return { ...safe, rePairRequired: false };
}

export function assertT132Rejoined(readiness, overview, session, oldAuthorizationId) {
  if (readiness.deviceIdentityFingerprint !== T132_A5_IDENTITY
      || readiness.syncGroupId !== T132_GROUP_ID
      || readiness.activeSyncGroupMemberCount !== 3
      || readiness.syncGroupCredentialsPresent !== true
      || readiness.syncGroupRemotePeerFingerprint !== T132_MAC_IDENTITY) {
    throw new Error('Fixed A5 did not establish the approved workgroup membership.');
  }
  assertPairSyncRuntimeOwnership(overview, session);
  const safe = session.sanitize(overview);
  const expected = [T132_A5_IDENTITY, T132_MAC_IDENTITY, T132_OFFLINE_IDENTITY].sort();
  if (overview.sync_group?.group_id !== T132_GROUP_ID
      || JSON.stringify(activeMemberFingerprints(overview)) !== JSON.stringify(expected)
      || safe.desktopPeerFingerprint !== T132_MAC_IDENTITY
      || safe.pairedDeviceFingerprints.length !== 0
      || safe.pendingDeviceFingerprints.length !== 0) {
    throw new Error('Mac did not establish the approved workgroup roster.');
  }
  const member = overview.sync_group.members.find(
    ({ device_id: id }) => macosPairSyncIdentityFingerprint(id) === T132_A5_IDENTITY
  );
  if (!member?.authorization_id || member.authorization_id === oldAuthorizationId) {
    throw new Error('Rejoined A5 reused its revoked member authorization.');
  }
  return { newAuthorizationId: member.authorization_id };
}

export function fingerprintSecretFreeCandidate(value) {
  return createHash('sha256').update(value).digest('hex');
}
