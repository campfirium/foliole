import { setTimeout as delay } from 'node:timers/promises';

import { MACOS_DAILY_LIBRARY_HOME } from '../macos/macos-electron-dev-paths.mjs';
import { assertPairSyncRuntimeOwnership } from '../windows/windows-a5-pair-sync-recovery-transport.mjs';
import { collectAndroidDeviceSnapshot } from './android-device-snapshot.mjs';
import { inspectPairSyncRecoveryWorkspace } from './android-pair-sync-recovery-readiness.mjs';
import { runMacosA5SyncGroupMaintenance } from './macos-a5-sync-group-maintenance-action.mjs';
import {
  macosPairSyncIdentityFingerprint, openMacosPairSyncDesktopSession
} from './macos-pair-sync-desktop-session.mjs';

const APP_ID = 'com.foliole.android';

function isFingerprint(value) {
  return /^[0-9a-f]{16}$/u.test(value ?? '');
}

function activeMemberFingerprints(overview) {
  return (overview.sync_group?.members ?? []).filter(({ state }) => state === 'active')
    .map(({ device_id: id }) => macosPairSyncIdentityFingerprint(id)).sort();
}

export async function collectCredentialProtectedReadiness(
  readiness, { paths, serial }, dependencies = {}
) {
  const collectSnapshot = dependencies.collectSnapshot ?? collectAndroidDeviceSnapshot;
  const snapshot = await collectSnapshot({
    adb: paths.adb, appId: APP_ID, databaseInspector: inspectPairSyncRecoveryWorkspace,
    includeAttachments: false, includeEvents: false, serial, tables: ['nodes']
  });
  const inspection = snapshot.database?.inspection;
  if (snapshot.database?.integrity !== 'ok' || !inspection) {
    throw new Error('A5 credential protection snapshot is unavailable.');
  }
  const sameWorkspace = inspection.activeSyncGroupMemberCount
      === readiness.activeSyncGroupMemberCount
    && inspection.deviceIdentityFingerprint === readiness.deviceIdentityFingerprint
    && inspection.dirtyRecordCount === readiness.dirtyRecordCount
    && inspection.nodeCount === readiness.nodeCount
    && inspection.syncGroupId === readiness.syncGroupId
    && inspection.syncGroupTimelineId === readiness.syncGroupTimelineId
    && inspection.workgroupKeyPresent === readiness.workgroupKeyPresent;
  if (!sameWorkspace) {
    throw new Error('A5 credential preflight changed before its protected snapshot.');
  }
  return { ...readiness, dirtyObjectCounts: inspection.dirtyObjectCounts,
    protectedContentDigest: inspection.protectedContentDigest };
}

export function assertJoinedEmptyCredentialReauthorization(readiness) {
  const exact = readiness.joinedEmptyReauthorization === true
    && readiness.nodeCount === 0 && readiness.dirtyRecordCount === 0
    && readiness.pairingCredentialsPresent === false
    && readiness.syncGroupCredentialsPresent === true
    && readiness.workgroupKeyPresent === true && readiness.syncGroupRoutePresent === true
    && readiness.activeSyncGroupMemberCount > 1
    && isFingerprint(readiness.deviceIdentityFingerprint)
    && isFingerprint(readiness.syncGroupRemotePeerFingerprint)
    && typeof readiness.syncGroupId === 'string'
    && typeof readiness.syncGroupTimelineId === 'string'
    && /^[0-9a-f]{64}$/u.test(readiness.protectedContentDigest ?? '');
  if (!exact) throw new Error('A5 does not match the exact joined-empty credential reauthorization boundary.');
  return {
    deviceIdentityFingerprint: readiness.deviceIdentityFingerprint,
    dirtyObjectCounts: readiness.dirtyObjectCounts ?? {},
    dirtyRecordCount: readiness.dirtyRecordCount,
    groupId: readiness.syncGroupId,
    nodeCount: readiness.nodeCount,
    protectedContentDigest: readiness.protectedContentDigest,
    remotePeerFingerprint: readiness.syncGroupRemotePeerFingerprint,
    timelineId: readiness.syncGroupTimelineId
  };
}

export function assertFreshCredentialRejoinBaseline(readiness, baseline) {
  const preserved = readiness.deviceIdentityFingerprint === baseline.deviceIdentityFingerprint
    && readiness.nodeCount === baseline.nodeCount
    && readiness.protectedContentDigest === baseline.protectedContentDigest
    && readiness.dirtyRecordCount === baseline.dirtyRecordCount
    && JSON.stringify(readiness.dirtyObjectCounts ?? {})
      === JSON.stringify(baseline.dirtyObjectCounts)
    && readiness.pairingCredentialsPresent === false
    && readiness.syncGroupCredentialsPresent === false
    && readiness.workgroupKeyPresent === false && readiness.syncGroupRoutePresent === false
    && readiness.syncGroupId === null && readiness.syncGroupTimelineId === null
    && readiness.storedSyncGroupId === null && readiness.storedSyncGroupTimelineId === null
    && readiness.existingPairing === false;
  if (!preserved) throw new Error('Product Leave did not preserve the exact fresh credential rejoin baseline.');
  return readiness;
}

function assertProtectedDesktop(overview, session, baseline, expectedMembers) {
  assertPairSyncRuntimeOwnership(overview, session);
  const members = activeMemberFingerprints(overview);
  const safe = session.sanitize(overview);
  if (overview.sync_group?.group_id !== baseline.groupId
      || overview.sync_group?.timeline_id !== baseline.timelineId
      || safe.desktopPeerFingerprint !== baseline.remotePeerFingerprint
      || safe.pendingDeviceFingerprints.length !== 0
      || JSON.stringify(members) !== JSON.stringify(expectedMembers)) {
    throw new Error('Desktop no longer protects the joined-empty Sync Group boundary.');
  }
  return members;
}

async function waitForProtectedDeparture(session, baseline, beforeMembers, wait) {
  const expected = beforeMembers.filter((member) => member !== baseline.deviceIdentityFingerprint);
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const overview = await session.load();
    try { return assertProtectedDesktop(overview, session, baseline, expected); }
    catch (error) {
      if (!activeMemberFingerprints(overview).includes(baseline.deviceIdentityFingerprint)) throw error;
    }
    await wait(250);
  }
  throw new Error('Desktop did not commit the protected A5 departure.');
}

export async function leaveJoinedEmptyCredentialSession(args, dependencies = {}) {
  const openSession = dependencies.openSession ?? openMacosPairSyncDesktopSession;
  const maintenance = dependencies.maintenance ?? runMacosA5SyncGroupMaintenance;
  const wait = dependencies.wait ?? delay;
  const session = await openSession({
    env: args.env, libraryHome: MACOS_DAILY_LIBRARY_HOME, repoRoot: args.paths.repoRoot
  });
  try {
    const overview = await session.enable();
    const beforeMembers = activeMemberFingerprints(overview);
    if (!beforeMembers.includes(args.baseline.deviceIdentityFingerprint)) {
      throw new Error('Desktop does not contain the active A5 member selected for credential rejoin.');
    }
    assertProtectedDesktop(overview, session, args.baseline, beforeMembers);
    const result = await maintenance({
      action: 'leave-sync-group', buildIdentity: args.buildIdentity, env: args.env,
      evidenceRoot: args.evidenceRoot, execute: args.execute, installMain: false,
      paths: args.paths, serial: args.serial
    });
    await waitForProtectedDeparture(session, args.baseline, beforeMembers, wait);
    return result;
  } finally {
    await session.close().catch(() => undefined);
  }
}
