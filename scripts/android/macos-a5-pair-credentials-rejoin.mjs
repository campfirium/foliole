import { setTimeout as delay } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';

import { assertPairSyncRuntimeOwnership } from '../windows/windows-a5-pair-sync-recovery-transport.mjs';
import {
  departedHistoryReadinessEvidence
} from './android-departed-history-inspection.mjs';
import { collectAndroidDeviceSnapshot } from './android-device-snapshot.mjs';
import { inspectPairSyncRecoveryWorkspace } from './android-pair-sync-recovery-readiness.mjs';
import {
  authorizationFingerprint
} from './android-sync-group-authorization-inspection.mjs';
import { assertDepartedCredentialBaseline } from './macos-a5-departed-credential-state.mjs';
import { runMacosA5SyncGroupMaintenance } from './macos-a5-sync-group-maintenance-action.mjs';
import { openMacosPairSyncDesktopSession } from './macos-pair-sync-desktop-session.mjs';

const APP_ID = 'com.foliole.android';

function isFingerprint(value) {
  return /^[0-9a-f]{16}$/u.test(value ?? '');
}

function activeMemberAuthorizationFingerprints(overview) {
  const fingerprints = (overview.sync_group?.members ?? [])
    .filter(({ state }) => state === 'active')
    .map(({ authorization_id: id }) => authorizationFingerprint(id));
  if (fingerprints.some((fingerprint) => !isFingerprint(fingerprint))) {
    throw new Error('Desktop active member authorization is missing.');
  }
  return fingerprints.sort();
}

function localMemberAuthorizationFingerprint(overview) {
  const group = overview.sync_group;
  const matches = (group?.members ?? []).filter(({ host_name: hostName, state }) =>
    state === 'active' && hostName === group.local_host_name
  );
  if (matches.length !== 1) return null;
  return authorizationFingerprint(matches[0].authorization_id);
}

export function inspectProtectedDesktopBoundary(overview, session, baseline, expectedMembers) {
  const members = activeMemberAuthorizationFingerprints(overview);
  const safe = session.sanitize(overview);
  const actual = {
    activeMemberAuthorizationFingerprints: members,
    localAuthorizationFingerprint: safe.localAuthorizationFingerprint,
    groupId: overview.sync_group?.group_id ?? null,
    localMemberAuthorizationFingerprint: localMemberAuthorizationFingerprint(overview),
    pendingAuthorizationFingerprints: safe.pendingAuthorizationFingerprints,
    timelineId: overview.sync_group?.timeline_id ?? null
  };
  const expected = {
    activeMemberAuthorizationFingerprints: expectedMembers,
    groupId: baseline.groupId,
    localMemberAuthorizationFingerprint: baseline.remotePeerAuthorizationFingerprint,
    pendingAuthorizationFingerprints: [],
    timelineId: baseline.timelineId
  };
  return { actual, expected };
}

function protectedDesktopBoundaryMatches({ actual, expected }) {
  return actual.groupId === expected.groupId
    && actual.timelineId === expected.timelineId
    && actual.localMemberAuthorizationFingerprint === expected.localMemberAuthorizationFingerprint
    && actual.pendingAuthorizationFingerprints.length === 0
    && JSON.stringify(actual.activeMemberAuthorizationFingerprints)
      === JSON.stringify(expected.activeMemberAuthorizationFingerprints);
}

function writeProtectedDesktopBoundaryEvidence(evidenceRoot, evidence) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  fs.writeFileSync(path.join(evidenceRoot, 'pair-credentials-protected-boundary.json'),
    `${JSON.stringify({ ...evidence, schemaVersion: 1 }, null, 2)}\n`, 'utf8');
}

export async function collectCredentialProtectedReadiness(
  readiness, { env, execute, paths, serial }, dependencies = {}
) {
  const collectSnapshot = dependencies.collectSnapshot ?? collectAndroidDeviceSnapshot;
  const stopped = await execute(paths.adb, [
    '-s', serial, 'shell', 'am', 'force-stop', APP_ID
  ], { env, timeoutCode: 'credential_snapshot_stop_timeout', timeoutMs: 30_000 });
  if (stopped.code !== 0) {
    throw Object.assign(new Error('Failed to stop A5 before credential protection snapshot.'), {
      result: stopped
    });
  }
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
    && inspection.dirtyRecordCount === readiness.dirtyRecordCount
    && inspection.nodeCount === readiness.nodeCount
    && inspection.syncGroupId === readiness.syncGroupId
    && inspection.syncGroupTimelineId === readiness.syncGroupTimelineId
    && JSON.stringify(departedHistoryReadinessEvidence(inspection))
      === JSON.stringify(departedHistoryReadinessEvidence(readiness))
    && inspection.workgroupKeyPresent === readiness.workgroupKeyPresent;
  if (!sameWorkspace) {
    throw new Error('A5 credential preflight changed before its protected snapshot.');
  }
  return { ...readiness, ...departedHistoryReadinessEvidence(inspection),
    dirtyObjectCounts: inspection.dirtyObjectCounts,
    localMemberAuthorizationFingerprint: inspection.localMemberAuthorizationFingerprint,
    protectedContentDigest: inspection.protectedContentDigest };
}

export function assertJoinedEmptyCredentialReauthorization(readiness) {
  const exact = readiness.joinedEmptyReauthorization === true
    && readiness.nodeCount === 0 && readiness.dirtyRecordCount === 0
    && readiness.pairingCredentialsPresent === true
    && readiness.pairingPeerAuthorizationFingerprint
      === readiness.syncGroupRemotePeerFingerprint
    && readiness.storedAuthorizationFingerprint
      === readiness.localMemberAuthorizationFingerprint
    && readiness.syncGroupCredentialsPresent === true
    && readiness.workgroupKeyPresent === true && readiness.syncGroupRoutePresent === true
    && readiness.activeSyncGroupMemberCount > 1
    && isFingerprint(readiness.localMemberAuthorizationFingerprint)
    && isFingerprint(readiness.syncGroupRemotePeerFingerprint)
    && typeof readiness.syncGroupId === 'string'
    && typeof readiness.syncGroupTimelineId === 'string'
    && /^[0-9a-f]{64}$/u.test(readiness.protectedContentDigest ?? '');
  if (!exact) throw new Error('A5 does not match the exact joined-empty credential reauthorization boundary.');
  return {
    hostName: readiness.hostName,
    dirtyObjectCounts: readiness.dirtyObjectCounts ?? {},
    dirtyRecordCount: readiness.dirtyRecordCount,
    groupId: readiness.syncGroupId,
    localMemberAuthorizationFingerprint: readiness.localMemberAuthorizationFingerprint,
    nodeCount: readiness.nodeCount,
    protectedContentDigest: readiness.protectedContentDigest,
    remotePeerAuthorizationFingerprint: readiness.syncGroupRemotePeerFingerprint,
    timelineId: readiness.syncGroupTimelineId
  };
}

export function assertFreshCredentialRejoinBaseline(readiness, baseline) {
  return assertDepartedCredentialBaseline(readiness, baseline);
}

function assertProtectedDesktop(overview, session, baseline, expectedMembers) {
  assertPairSyncRuntimeOwnership(overview, session);
  const evidence = inspectProtectedDesktopBoundary(overview, session, baseline, expectedMembers);
  if (!protectedDesktopBoundaryMatches(evidence)) {
    throw new Error('Desktop no longer protects the joined-empty Sync Group boundary.');
  }
  return evidence.actual.activeMemberAuthorizationFingerprints;
}

async function waitForProtectedDeparture(session, baseline, beforeMembers, wait) {
  const expected = beforeMembers.filter(
    (member) => member !== baseline.localMemberAuthorizationFingerprint
  );
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const overview = await session.load();
    try { return assertProtectedDesktop(overview, session, baseline, expected); }
    catch (error) {
      if (!activeMemberAuthorizationFingerprints(overview)
        .includes(baseline.localMemberAuthorizationFingerprint)) throw error;
    }
    await wait(250);
  }
  throw new Error('Desktop did not commit the protected A5 departure.');
}

export async function leaveJoinedEmptyCredentialSession(args, dependencies = {}) {
  const openSession = dependencies.openSession ?? openMacosPairSyncDesktopSession;
  const maintenance = dependencies.maintenance ?? runMacosA5SyncGroupMaintenance;
  const wait = dependencies.wait ?? delay;
  const writeBoundaryEvidence = dependencies.writeBoundaryEvidence
    ?? writeProtectedDesktopBoundaryEvidence;
  const session = await openSession({
    env: args.env, libraryHome: args.paths.desktopDevLibrary,
    repoRoot: args.paths.buildRoot
  });
  try {
    const overview = await session.enable();
    const beforeMembers = activeMemberAuthorizationFingerprints(overview);
    if (!beforeMembers.includes(args.baseline.localMemberAuthorizationFingerprint)) {
      throw new Error('Desktop does not contain the active A5 member selected for credential rejoin.');
    }
    writeBoundaryEvidence(args.evidenceRoot,
      inspectProtectedDesktopBoundary(overview, session, args.baseline, beforeMembers));
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
