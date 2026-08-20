/* global process */

import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { MACOS_DAILY_LIBRARY_HOME } from '../macos/macos-electron-dev-paths.mjs';
import { parsePairSyncRecoveryReadiness } from '../windows/windows-a5-pair-sync-recovery-contract.mjs';
import { collectAndroidDeviceSnapshot } from './android-device-snapshot.mjs';
import { inspectPairSyncRecoveryWorkspace } from './android-pair-sync-recovery-readiness.mjs';
import { proveMacosA5ExistingSyncContinuation } from './macos-a5-existing-sync-acceptance.mjs';
import { runMacosA5PairSync } from './macos-a5-pair-sync-action.mjs';
import { recoverExistingT132Credential } from './macos-a5-sync-group-credential-recovery.mjs';
import { runMacosA5SyncGroupMaintenance } from './macos-a5-sync-group-maintenance-action.mjs';
import { assertFrozenSyncGroupCandidate, captureSyncGroupCandidate } from './macos-a5-sync-group-candidate.mjs';
import {
  assertT132A5ProviderAvailability, observeT132A5Provider
} from './macos-a5-sync-group-provider-acceptance.mjs';
import { openMacosPairSyncDesktopSession } from './macos-pair-sync-desktop-session.mjs';
import { assertLegacyTransitionRuntime } from './macos-a5-sync-group-transition-runtime.mjs';
import {
  assertT132CredentialRecoveryBaseline, assertT132MacBaseline, assertT132ProtectedBaseline, assertT132Rejoined,
  assertT132UnboundAfterRestart, T132_A5_IDENTITY,
  T132_GROUP_ID, T132_MAC_IDENTITY, T132_TIMELINE_ID,
  validateT132DepartedMemberDesktop
} from './macos-a5-sync-group-rejoin-contract.mjs';

const APP_ID = 'com.foliole.android';
const UNIQUE_DISCOVERY_TARGET = () => [];
const CREDENTIALS_ONLY_DISCOVERY_TARGET = () => [
  '-e', 'foliolePairSyncEvidenceGoal', 'credentials-signable'
];

async function readiness(execute, paths, env, serial) {
  const result = await execute(process.execPath, [
    path.join(paths.repoRoot, 'scripts/android/android-pair-sync-recovery-readiness-runner.mjs'),
    '--adb', paths.adb, '--serial', serial, '--app-id', APP_ID
  ], { env, timeoutMs: 60_000 });
  if (![0, 77].includes(result.code)) throw Object.assign(new Error('A5 readiness failed'), { result });
  const parsed = parsePairSyncRecoveryReadiness(result.stdout);
  const snapshot = await androidSnapshot(paths, serial);
  const inspection = snapshot.database?.inspection;
  if (snapshot.database?.integrity !== 'ok' || !inspection) {
    throw new Error('A5 readiness snapshot is unavailable.');
  }
  return { ...parsed,
    currentDeliveryStatusCountsByPeerFingerprint:
      inspection.currentDeliveryStatusCountsByPeerFingerprint,
    dirtyObjectCounts: inspection.dirtyObjectCounts,
    journeyFacts: inspection.journeyFacts,
    protectedContentDigest: inspection.protectedContentDigest };
}

async function restartA5(execute, paths, env, serial, leaveStopped = false) {
  await execute(paths.adb, ['-s', serial, 'shell', 'am', 'force-stop', APP_ID], { env, timeoutMs: 30_000 });
  if (!leaveStopped) await execute(paths.adb, [
    '-s', serial, 'shell', 'am', 'start', '-W', '-n', `${APP_ID}/.MainActivity`
  ], { env, timeoutMs: 60_000 });
}

export async function collectStoppedReadiness({ inspect, start, stop }) {
  await stop();
  try { return await inspect(); }
  finally { await start(); }
}

async function androidSnapshot(paths, serial) {
  return collectAndroidDeviceSnapshot({ adb: paths.adb, appId: APP_ID, includeAttachments: false,
    includeEvents: false, serial, tables: ['nodes'], databaseInspector: inspectPairSyncRecoveryWorkspace });
}

async function withDesktopSession(paths, env, action) {
  const session = await openMacosPairSyncDesktopSession({ env, libraryHome: MACOS_DAILY_LIBRARY_HOME,
    repoRoot: paths.repoRoot });
  try { return await action(session); }
  finally { await session.close().catch(() => undefined); }
}

async function waitForMacDeparture(session) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const overview = await session.load();
    if (overview.sync_group?.members?.length === 2 && overview.paired_devices.length === 0) return overview;
    await delay(250);
  }
  throw new Error('Mac did not commit the fixed A5 departure.');
}

export async function runMacosA5SyncGroupRejoinJourney({
  buildDesktop, buildIdentity, credentialRecoveryRequired = true, env, evidenceRoot, execute,
  paths, readiness: baseline, serial
}) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const baselineSnapshot = await androidSnapshot(paths, serial);
  baseline.protectedContentDigest = baselineSnapshot.database?.inspection?.protectedContentDigest;
  if (credentialRecoveryRequired) assertT132CredentialRecoveryBaseline(baseline);
  else assertT132ProtectedBaseline(baseline);
  const legacyTransition = assertLegacyTransitionRuntime(paths.repoRoot);
  const candidate = captureSyncGroupCandidate(paths.repoRoot);
  fs.writeFileSync(path.join(evidenceRoot, 't132-3-candidate.json'), `${JSON.stringify({
    baseline: { activeMemberCount: baseline.activeSyncGroupMemberCount,
      deviceIdentityFingerprint: baseline.deviceIdentityFingerprint,
      groupId: baseline.syncGroupId, nodeCount: baseline.nodeCount,
      dirtyObjectCounts: baseline.dirtyObjectCounts, dirtyRecordCount: baseline.dirtyRecordCount,
      protectedContentDigest: baseline.protectedContentDigest,
      timelineId: baseline.syncGroupTimelineId },
    candidate, frozenAt: new Date().toISOString(), legacyTransition, schemaVersion: 1,
    successCriteria: [
      'leave_preserves_identity_and_content',
      'first_leave_uses_existing_formal_product_contract',
      'restart_does_not_restore_group_credential_route_or_progress',
      'rejoin_uses_new_member_authorization_and_fresh_credentials',
      'foreground_provider_completes_bidirectional_sync',
      'restart_preserves_group_timeline_authorization_and_content',
      'stopped_provider_is_unreachable_without_revoking_membership'
    ]
  }, null, 2)}\n`, 'utf8');
  await buildDesktop();
  const protectedMember = await withDesktopSession(paths, env, async (session) =>
    assertT132MacBaseline(await session.enable(), session));
  if (credentialRecoveryRequired) await recoverExistingT132Credential({
    buildIdentity, env, evidenceRoot, execute,
    instrumentationModeArgs: UNIQUE_DISCOVERY_TARGET, paths, serial
  });
  assertFrozenSyncGroupCandidate(candidate, paths.repoRoot);
  assertT132ProtectedBaseline(await readiness(execute, paths, env, serial));
  const { oldAuthorizationId } = await withDesktopSession(paths, env, async (session) => {
    const before = await session.enable();
    const recoveredMember = assertT132MacBaseline(before, session);
    if (recoveredMember.oldAuthorizationId !== protectedMember.oldAuthorizationId) {
      throw new Error('Credential recovery rewrote the active member authorization.');
    }
    await runMacosA5SyncGroupMaintenance({ action: 'leave-sync-group', buildIdentity, env,
      evidenceRoot: path.join(evidenceRoot, 'first-leave'), execute, installMain: false, paths, serial });
    await waitForMacDeparture(session);
    return recoveredMember;
  });
  assertFrozenSyncGroupCandidate(candidate, paths.repoRoot);
  await restartA5(execute, paths, env, serial);
  await restartA5(execute, paths, env, serial, true);
  const afterLeave = await readiness(execute, paths, env, serial);
  assertT132UnboundAfterRestart(afterLeave, baseline);
  assertFrozenSyncGroupCandidate(candidate, paths.repoRoot);
  const pair = await runMacosA5PairSync({ buildIdentity, credentialRepairRequired: false,
    desktopControl: async () => ({ code: 0, output: '' }),
    deviceFingerprint: T132_A5_IDENTITY, existingPairing: false, env,
    evidenceRoot: path.join(evidenceRoot, 'rejoin'), execute, paths, protectData: undefined,
    instrumentationModeArgs: CREDENTIALS_ONLY_DISCOVERY_TARGET,
    pairedDeviceFingerprint: null,
    recoveryEvidenceGoal: 'credentials-signable',
    remotePeerFingerprint: T132_MAC_IDENTITY, serial,
    validateDesktop: validateT132DepartedMemberDesktop });
  const pairReceipt = JSON.parse(fs.readFileSync(path.join(
    evidenceRoot, 'rejoin', 'pair-sync-recovery-receipt.json'
  ), 'utf8'));
  if (pairReceipt.pairingPath !== 'new') throw new Error('A5 rejoin did not use a fresh product join.');
  assertFrozenSyncGroupCandidate(candidate, paths.repoRoot);
  const rejoinedReadiness = await collectStoppedReadiness({
    inspect: () => readiness(execute, paths, env, serial),
    start: () => restartA5(execute, paths, env, serial),
    stop: () => restartA5(execute, paths, env, serial, true)
  });
  const rejoined = await withDesktopSession(paths, env, async (session) =>
    assertT132Rejoined(rejoinedReadiness, await session.load(), session, oldAuthorizationId));
  const continuation = await proveMacosA5ExistingSyncContinuation({ buildIdentity, env,
    evidenceRoot: path.join(evidenceRoot, 'bidirectional'), execute, paths,
    readiness: rejoinedReadiness, serial });
  assertFrozenSyncGroupCandidate(candidate, paths.repoRoot);
  await restartA5(execute, paths, env, serial);
  const foregroundProvider = assertT132A5ProviderAvailability(
    await observeT132A5Provider(), true
  );
  await restartA5(execute, paths, env, serial, true);
  const stoppedProvider = assertT132A5ProviderAvailability(
    await observeT132A5Provider(), false
  );
  assertFrozenSyncGroupCandidate(candidate, paths.repoRoot);
  const manifestPath = path.join(evidenceRoot, 't132-3-rejoin-manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify({ buildIdentity, candidate,
    completedAt: new Date().toISOString(), continuation: continuation.manifestPath,
    groupId: T132_GROUP_ID, identity: T132_A5_IDENTITY, pair: pair.pairSyncRecovery.manifestPath,
    provider: { foreground: foregroundProvider, stopped: stoppedProvider },
    resultStatus: 'success', schemaVersion: 1, timelineId: T132_TIMELINE_ID,
    ...rejoined }, null, 2)}\n`, 'utf8');
  return { manifestPath };
}

export async function recoverMacosA5DepartedCheckpoint({
  buildIdentity, env, evidenceRoot, execute, paths, serial
}) {
  const departed = await readiness(execute, paths, env, serial);
  assertT132UnboundAfterRestart(departed, {
    dirtyObjectCounts: {},
    dirtyRecordCount: 0,
    nodeCount: 1405,
    protectedContentDigest: 'ed3576d13c0f1a3e20d16f5391e5d57b01c732a767cc6ea771229b41605e5fed'
  });
  const pair = await runMacosA5PairSync({ buildIdentity, credentialRepairRequired: false,
    desktopControl: async () => ({ code: 0, output: '' }),
    deviceFingerprint: T132_A5_IDENTITY, existingPairing: false, env, evidenceRoot,
    execute, instrumentationModeArgs: UNIQUE_DISCOVERY_TARGET,
    pairedDeviceFingerprint: null,
    paths, remotePeerFingerprint: T132_MAC_IDENTITY, serial,
    validateDesktop: validateT132DepartedMemberDesktop });
  const receipt = JSON.parse(fs.readFileSync(path.join(
    evidenceRoot, 'pair-sync-recovery-receipt.json'
  ), 'utf8'));
  if (receipt.pairingPath !== 'new') throw new Error('Recovery did not establish a fresh join.');
  const recovered = assertT132ProtectedBaseline(
    await readiness(execute, paths, env, serial), false
  );
  await withDesktopSession(paths, env, async (session) => {
    assertT132Rejoined(recovered, await session.enable(), session, 'revoked-before-recovery');
  });
  return { manifestPath: pair.pairSyncRecovery.manifestPath, recovered };
}
