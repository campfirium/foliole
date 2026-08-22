/* global process */

import fs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

import { runWindowsA5PairSyncRecovery } from '../windows/windows-a5-pair-sync-recovery-action.mjs';
import { assertPairSyncRuntimeOwnership } from '../windows/windows-a5-pair-sync-recovery-transport.mjs';
import {
  openMacosPairSyncDesktopSession, waitForMacosPairRequest
} from './macos-pair-sync-desktop-session.mjs';
import { macosPairSyncAuthorizationFingerprint } from './macos-pair-sync-desktop-session.mjs';

function assertHostRoster(overview) {
  const members = overview.sync_group?.members;
  if (!Array.isArray(members)) return false;
  const active = members.filter((member) => member.state === 'active');
  if (active.length === 0) {
    throw new Error('Current Sync Group Host roster requires user review.');
  }
  const hosts = active.map((member) => member.host_name);
  const authorizations = active.map((member) => member.authorization_id);
  if (hosts.some((value) => typeof value !== 'string' || !value.trim())
      || authorizations.some((value) => typeof value !== 'string' || !value.trim())
      || new Set(hosts).size !== hosts.length
      || new Set(authorizations).size !== authorizations.length) {
    throw new Error('Current Sync Group Host roster requires user review.');
  }
  return true;
}

export async function reconcileAuthorizedMacosDailyPairing(
  overview, session, hostName, desktopAuthorizationFingerprint, existingPairing,
  credentialRepairRequired = false, protectedSyncGroup = null
) {
  assertPairSyncRuntimeOwnership(overview, session);
  assertHostRoster(overview);
  if (protectedSyncGroup
      && (overview.sync_group?.group_id !== protectedSyncGroup.groupId
        || overview.sync_group?.timeline_id !== protectedSyncGroup.timelineId)) {
    throw new Error('Current Sync Group identity requires user review.');
  }
  const safe = session.sanitize(overview);
  if (!safe.localAuthorizationFingerprint
      || safe.pendingAuthorizationFingerprints.length > 0
      || (desktopAuthorizationFingerprint
        && safe.localAuthorizationFingerprint !== desktopAuthorizationFingerprint)) {
    throw new Error('Current Sync Group authorization route requires user review.');
  }
  const member = overview.sync_group.members.find(
    (candidate) => candidate.state === 'active' && candidate.host_name === hostName
  );
  const memberAuthorizationFingerprint = member
    ? macosPairSyncAuthorizationFingerprint(member.authorization_id) : null;
  const routes = overview.paired_authorizations.filter(
    (authorization) => authorization.host_name === hostName
  );
  const routeAuthorizationFingerprint = routes.length === 1
    ? macosPairSyncAuthorizationFingerprint(routes[0].authorization_id) : null;
  if (existingPairing && (!memberAuthorizationFingerprint
      || routeAuthorizationFingerprint !== memberAuthorizationFingerprint)) {
    throw new Error('Existing A5 authorization route is missing.');
  }
  if (!existingPairing && (memberAuthorizationFingerprint || routes.length > 0)) {
    throw new Error('Fresh A5 authorization route is not empty.');
  }
  return { ...safe, rePairRequired: credentialRepairRequired || !existingPairing };
}

async function macosDesktopControl(execute, _paths, _env, action) {
  if (action === 'stop') {
    const result = await execute('/usr/bin/pkill', [
      '-TERM', '-f', '^/Applications/Foliole[.]app/Contents/MacOS/Foliole( |$)'
    ], { timeoutCode: 'desktop_stop_timeout', timeoutMs: 30_000 });
    if (![0, 1].includes(result.code)) throw new Error('Installed Foliole did not stop cleanly.');
    await delay(1_500);
    return { ...result, output: result.output || '[macos-a5-dev] installed Foliole stopped\n' };
  }
  return {
    code: 0,
    output: '[macos-a5-dev] one-shot desktop closed; registered DEV restart required\n'
  };
}

export async function runMacosA5PairSync({
  approvalRequired, buildIdentity, credentialRepairRequired, desktopControl = macosDesktopControl,
  existingPairing, env, evidenceRoot, execute, hostName,
  libraryHome, paths, protectData, desktopAuthorizationFingerprint,
  openTransport, closeTransport,
  instrumentationModeArgs, pairedAuthorizationFingerprint, pairRequestIdentity,
  protectedSyncGroup, recoveryEvidenceGoal,
  runPairSyncRecovery = runWindowsA5PairSyncRecovery, serial,
  validateDesktop
}) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const validateMacosDesktop = validateDesktop ?? ((...args) =>
    reconcileAuthorizedMacosDailyPairing(
      ...args, protectedSyncGroup
    ));
  return runPairSyncRecovery({
    adbPort: '5037', buildIdentity, env, evidenceRoot, execute, hostName,
    existingPairing,
    ...(approvalRequired !== undefined ? { approvalRequired } : {}),
    ...(closeTransport ? { closeTransport } : {}),
    openDesktopSession: (options) => openMacosPairSyncDesktopSession({
      ...options, libraryHome, runtimeRoot: paths.desktopRuntimeRoot
    }),
    ...(openTransport ? { openTransport } : {}),
    ...(instrumentationModeArgs ? { instrumentationModeArgs } : {}),
    ...(pairedAuthorizationFingerprint !== undefined ? { pairedAuthorizationFingerprint } : {}),
    ...(pairRequestIdentity ? { pairRequestIdentity } : {}),
    ...(recoveryEvidenceGoal ? { recoveryEvidenceGoal } : {}),
    desktopControl, validateDesktop: validateMacosDesktop,
    paths: {
      adbPath: paths.adb,
      repoRoot: paths.buildRoot,
      systemNode: process.execPath
    },
    protectData,
    credentialRepairRequired,
    desktopAuthorizationFingerprint,
    serial,
    waitForPairRequest: (session, identity) => waitForMacosPairRequest(session, identity)
  });
}
