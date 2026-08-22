/* global console, process */

import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { runMacosA5SyncGroupMaintenance } from './macos-a5-sync-group-maintenance-action.mjs';
import {
  assertT132CredentialRecoveryBaseline, assertT132ProtectedBaseline
} from './macos-a5-sync-group-rejoin-contract.mjs';
import { inspectMacosA5SyncGroupFacts } from './macos-a5-pair-sync-preflight.mjs';
import { PAIR_SYNC_PORT } from '../windows/windows-a5-pair-sync-recovery-transport.mjs';

const APP_ID = 'com.foliole.android';

export function macosA5ErrorEvidence(error) {
  const output = error?.result?.output;
  return typeof output === 'string' && output ? output : '';
}

export function buildMacosA5Desktop(checked, paths) {
  checked('npm', ['run', 'build'], { cwd: paths.buildRoot });
  checked('npm', ['run', 'electron:compile'], { cwd: paths.buildRoot });
}

export function macosA5ParallelDesktopEnv(env) {
  return { ...env, FOLIOLE_ALLOW_PARALLEL_INSTANCE: '1' };
}

export async function runMacosA5SettledStoppedStatus(args) {
  args.assertFixed();
  const { openMacosPairSyncDesktopSession } = await import('./macos-pair-sync-desktop-session.mjs');
  const session = await openMacosPairSyncDesktopSession({ env: args.env,
    libraryHome: args.paths.desktopDevLibrary, repoRoot: args.paths.buildRoot,
    runtimeRoot: args.paths.desktopRuntimeRoot });
  try {
    await session.enable();
    args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'force-stop', 'com.foliole.android']);
    args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'start', '-n',
      'com.foliole.android/.MainActivity']);
    await delay(90_000);
    args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'force-stop', 'com.foliole.android']);
    args.pairingReadiness(args.paths); args.readiness(args.paths);
  } finally { await session.close().catch(() => undefined); }
}

export async function runMacosA5DatabasePerformanceEntry(args) {
  args.assertFixed(); args.build();
  const { runA5DatabasePerformance } = await import('./android-a5-database-performance-action.mjs');
  const result = await runA5DatabasePerformance({ env: args.env,
    evidenceRoot: path.join(args.paths.artifactsRoot, 'companion-database-performance'),
    execute: args.execute, paths: args.paths, serial: args.serial });
  process.stdout.write(result.output);
  console.log(`[macos-a5-dev] database-performance evidence=${result.evidencePath}`);
}

export async function runMacosA5ClearAppDataEntry(args) {
  const buildIdentity = args.buildIdentity();
  args.assertFixed(); args.build();
  args.checked(args.paths.adb, ['-s', args.serial, 'install', '-r', args.paths.apk]);
  const cleared = await args.execute(args.paths.adb,
    ['-s', args.serial, 'shell', 'pm', 'clear', APP_ID],
    { env: args.env, timeoutCode: 'clear_app_data_timeout', timeoutMs: 60_000 });
  if (cleared.code !== 0 || !/^Success\s*$/mu.test(cleared.stdout)) {
    throw Object.assign(new Error('Fixed A5 app data clear failed'), { result: cleared });
  }
  args.checked(args.paths.adb, ['-s', args.serial, 'shell', 'am', 'start', '-n', `${APP_ID}/.MainActivity`]);
  args.checked(process.execPath, [path.join(args.paths.buildRoot, 'scripts/android/verify-android-launch.mjs'),
    '--adb', args.paths.adb, '--serial', args.serial, '--app-id', APP_ID,
    '--component', `${APP_ID}/.MainActivity`, '--timeout-seconds', '30', '--stability-seconds', '3']);
  const activation = await runMacosA5SyncGroupMaintenance({
    action: 'activate-participation', buildIdentity, env: args.env,
    evidenceRoot: path.join(args.paths.artifactsRoot, 'a5-clear-app-data',
      buildIdentity, 'activate-participation'), execute: args.execute, installMain: false,
    paths: args.paths, serial: args.serial
  });
  process.stdout.write(activation.output);
  const { runMacosA5PairSyncPreflight } = await import('./macos-a5-pair-sync-preflight.mjs');
  const readiness = runMacosA5PairSyncPreflight(args.paths);
  if (readiness.nodeCount !== 0 || readiness.dirtyRecordCount !== 0
    || readiness.pairingCredentialsPresent !== false) {
    throw new Error('Fixed A5 did not establish an empty unpaired workspace after clear.');
  }
  const evidenceRoot = path.join(args.paths.artifactsRoot, 'a5-clear-app-data');
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const evidencePath = path.join(evidenceRoot, `${buildIdentity}.json`);
  fs.writeFileSync(evidencePath, `${JSON.stringify({ completedAt: new Date().toISOString(),
    nodeCount: 0, pairingCredentialsPresent: false, participationActivated: true,
    resultStatus: 'success', serial: args.serial
  }, null, 2)}\n`, 'utf8');
  console.log(`[macos-a5-dev] clear-app-data evidence=${evidencePath}`);
}

export async function runMacosA5WindowsJoinEntry(args) {
  const result = await args.execute(process.execPath, [
    path.join(args.paths.buildRoot, 'scripts/android/macos-a5-windows-join-action.mjs')
  ], { env: args.env, timeoutCode: 'windows_sync_group_timeout', timeoutMs: 25 * 60_000 });
  if (result.code !== 0) throw Object.assign(new Error('Windows Sync Group recovery failed'), { result });
  process.stdout.write(result.output);
}

export async function runMacosA5DesktopLeaveEntry(args) {
  args.assertFixed();
  await args.execute(args.paths.adb, [
    '-s', args.serial, 'shell', 'am', 'start', '-n', 'com.foliole.android/.MainActivity'
  ], { env: args.env, timeoutMs: 60_000 });
  await args.execute(args.paths.adb, [
    '-s', args.serial, 'forward', `tcp:${PAIR_SYNC_PORT}`, `tcp:${PAIR_SYNC_PORT}`
  ], { env: args.env, timeoutMs: 30_000 });
  try {
    const result = await args.execute(process.execPath, [
      path.join(args.paths.buildRoot, 'scripts/macos/macos-sync-group-leave-action.mjs')
    ], { env: args.env, timeoutMs: 120_000 });
    if (result.code !== 0) throw Object.assign(new Error('macOS Sync Group Leave failed'), { result });
    process.stdout.write(result.output);
  } finally {
    await args.execute(args.paths.adb, [
      '-s', args.serial, 'forward', '--remove', `tcp:${PAIR_SYNC_PORT}`
    ], { env: args.env, timeoutMs: 30_000 });
  }
}

export async function runMacosA5PairSyncEntry(args) {
  args.assertFixed();
  const { resolveMacosA5PairSyncReadiness } = await import('./macos-a5-product-bootstrap.mjs');
  const readiness = resolveMacosA5PairSyncReadiness(args.paths);
  const { consumeCredentialsSignableHandoff } = await import('./macos-a5-credential-handoff.mjs');
  const handoff = consumeCredentialsSignableHandoff({
    artifactsRoot: args.paths.artifactsRoot, readiness,
    currentRevision: args.paths.acceptedRevision ?? undefined,
    sourceRepoRoot: args.paths.sourceRepoRoot
  });
  args.build(); buildMacosA5Desktop(args.checked, args.paths);
  const buildIdentity = args.buildIdentity();
  const { runMacosA5PairSync } = await import('./macos-a5-pair-sync-action.mjs');
  const result = await runMacosA5PairSync({
    buildIdentity, credentialRepairRequired: readiness.credentialRepairRequired,
    desktopAuthorizationFingerprint: handoff.peerFingerprint, env: args.env,
    evidenceRoot: path.join(args.paths.artifactsRoot, 'a5-pair-sync', buildIdentity),
    execute: args.execute, existingPairing: true, hostName: readiness.hostName,
    pairedAuthorizationFingerprint: readiness.localMemberAuthorizationFingerprint,
    paths: args.paths,
    protectedSyncGroup: { groupId: handoff.groupId, timelineId: handoff.timelineId },
    serial: args.serial
  });
  process.stdout.write(result.output);
  console.log(`[macos-a5-dev] pair-sync evidence=${result.pairSyncRecovery.manifestPath}`);
}

export async function runMacosA5ExistingSyncEntry(args) {
  args.assertFixed();
  const { runMacosA5ExistingSyncPreflight } = await import('./macos-a5-pair-sync-preflight.mjs');
  const readiness = runMacosA5ExistingSyncPreflight(args.paths);
  const existingCredentials = readiness.syncGroupCredentialsPresent === true
    && /^[0-9a-f]{16}$/u.test(readiness.syncGroupRemotePeerFingerprint ?? '');
  if (!existingCredentials || readiness.syncGroupPeerConflict) {
    throw new Error('Existing A5 Sync Group credentials are not uniquely owned.');
  }
  args.build(); buildMacosA5Desktop(args.checked, args.paths);
  const buildIdentity = args.buildIdentity();
  const evidenceRoot = path.join(args.paths.artifactsRoot, 'a5-existing-sync', buildIdentity);
  await args.protectData('backup', path.join(evidenceRoot, 'baseline.json'),
    path.join(args.paths.deviceBackupRoot, buildIdentity));
  const { runMacosA5PairSync } = await import('./macos-a5-pair-sync-action.mjs');
  const result = await runMacosA5PairSync({
    buildIdentity, credentialRepairRequired: false,
    desktopAuthorizationFingerprint: readiness.syncGroupRemotePeerFingerprint,
    env: args.env,
    evidenceRoot,
    execute: args.execute, existingPairing: true, hostName: readiness.hostName,
    pairedAuthorizationFingerprint: readiness.localMemberAuthorizationFingerprint,
    paths: args.paths, serial: args.serial
  });
  process.stdout.write(result.output);
  console.log(`[macos-a5-dev] existing-sync evidence=${result.pairSyncRecovery.manifestPath}`);
  const { proveMacosA5ExistingSyncContinuation } = await import(
    './macos-a5-existing-sync-acceptance.mjs'
  );
  const continuation = await proveMacosA5ExistingSyncContinuation({
    buildIdentity, env: args.env, evidenceRoot, execute: args.execute,
    paths: args.paths, readiness, serial: args.serial
  });
  console.log(`[macos-a5-dev] existing-sync continuation=${continuation.manifestPath}`);
}

export async function runMacosA5SyncGroupRejoinEntry(args) {
  args.assertFixed();
  const inspected = inspectMacosA5SyncGroupFacts(args.paths);
  const credentialRecoveryRequired = inspected.syncGroupCredentialsPresent !== true;
  const readiness = credentialRecoveryRequired
    ? assertT132CredentialRecoveryBaseline(inspected)
    : assertT132ProtectedBaseline(inspected);
  args.build();
  const buildIdentity = args.buildIdentity();
  const evidenceRoot = path.join(args.paths.artifactsRoot, 'a5-sync-group-rejoin', buildIdentity);
  const stopped = await args.execute(args.paths.adb, [
    '-s', args.serial, 'shell', 'am', 'force-stop', 'com.foliole.android'
  ], { env: args.env, timeoutMs: 30_000 });
  if (stopped.code !== 0) throw Object.assign(new Error('Failed to stop A5 before baseline backup'), {
    result: stopped
  });
  await args.protectData('backup', path.join(evidenceRoot, 'baseline.json'),
    path.join(args.paths.deviceBackupRoot, buildIdentity));
  const { runMacosA5SyncGroupRejoinJourney } = await import(
    './macos-a5-sync-group-rejoin-action.mjs'
  );
  const result = await runMacosA5SyncGroupRejoinJourney({
    buildDesktop: async () => buildMacosA5Desktop(args.checked, args.paths), buildIdentity,
    credentialRecoveryRequired,
    env: macosA5ParallelDesktopEnv(args.env),
    evidenceRoot, execute: args.execute, paths: args.paths, readiness, serial: args.serial });
  console.log(`[macos-a5-dev] sync-group-rejoin evidence=${result.manifestPath}`);
}

export async function recoverMacosA5SyncGroupRejoinEntry(args) {
  args.assertFixed();
  args.build(); buildMacosA5Desktop(args.checked, args.paths);
  const buildIdentity = args.buildIdentity();
  const { recoverMacosA5DepartedCheckpoint } = await import(
    './macos-a5-sync-group-rejoin-action.mjs'
  );
  const result = await recoverMacosA5DepartedCheckpoint({ buildIdentity,
    env: macosA5ParallelDesktopEnv(args.env),
    evidenceRoot: path.join(args.paths.artifactsRoot, 'a5-sync-group-rejoin-recovery', buildIdentity),
    execute: args.execute, paths: args.paths, serial: args.serial });
  console.log(`[macos-a5-dev] sync-group-rejoin recovery=${result.manifestPath}`);
}
