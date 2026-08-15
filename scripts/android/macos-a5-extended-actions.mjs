/* global console, process */

import path from 'node:path';

import { runMacosA5SyncGroupMaintenance } from './macos-a5-sync-group-maintenance-action.mjs';
import { PAIR_SYNC_PORT } from '../windows/windows-a5-pair-sync-recovery-transport.mjs';

export function buildMacosA5Desktop(checked, paths) {
  checked('npm', ['run', 'build'], { cwd: paths.repoRoot });
  checked('npm', ['run', 'electron:compile'], { cwd: paths.repoRoot });
}

export async function runMacosA5DatabasePerformanceEntry(args) {
  args.assertFixed(); args.build();
  const { runA5DatabasePerformance } = await import('./android-a5-database-performance-action.mjs');
  const result = await runA5DatabasePerformance({ env: args.env,
    evidenceRoot: path.join(args.paths.repoRoot, '.tmp/artifacts/companion-database-performance'),
    execute: args.execute, paths: args.paths, serial: args.serial });
  process.stdout.write(result.output);
  console.log(`[macos-a5-dev] database-performance evidence=${result.evidencePath}`);
}

export async function runMacosA5SyncGroupMaintenanceEntry(args) {
  args.assertFixed(); args.build();
  const result = await runMacosA5SyncGroupMaintenance({
    action: args.action, buildIdentity: args.buildIdentity, env: args.env,
    evidenceRoot: path.join(args.paths.repoRoot, '.tmp/artifacts/a5-sync-group-maintenance', args.buildIdentity),
    execute: args.execute, paths: args.paths, serial: args.serial
  });
  process.stdout.write(result.output);
  console.log(`[macos-a5-dev] ${args.action} evidence=${result.manifestPath}`);
}

export async function runMacosA5WindowsJoinEntry(args) {
  const result = await args.execute(process.execPath, [
    path.join(args.paths.repoRoot, 'scripts/android/macos-a5-windows-join-action.mjs')
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
      path.join(args.paths.repoRoot, 'scripts/macos/macos-sync-group-leave-action.mjs')
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
  const { resolveMacosA5PairSyncReadiness } = await import('./macos-a5-product-bootstrap.mjs');
  const readiness = resolveMacosA5PairSyncReadiness(args.paths);
  args.build(); buildMacosA5Desktop(args.checked, args.paths);
  const buildIdentity = args.buildIdentity();
  const { runMacosA5PairSync } = await import('./macos-a5-pair-sync-action.mjs');
  const result = await runMacosA5PairSync({
    buildIdentity, credentialRepairRequired: readiness.credentialRepairRequired,
    deviceFingerprint: readiness.deviceIdentityFingerprint, env: args.env,
    evidenceRoot: path.join(args.paths.repoRoot, '.tmp/artifacts/a5-pair-sync', buildIdentity),
    execute: args.execute, existingPairing: readiness.existingPairing, paths: args.paths,
    remotePeerFingerprint: readiness.remotePeerFingerprint,
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
  const evidenceRoot = path.join(args.paths.repoRoot, '.tmp/artifacts/a5-existing-sync', buildIdentity);
  await args.protectData('backup', path.join(evidenceRoot, 'baseline.json'),
    path.join(args.paths.repoRoot, '.lab/internal/android-device-backups', buildIdentity));
  const { runMacosA5PairSync } = await import('./macos-a5-pair-sync-action.mjs');
  const result = await runMacosA5PairSync({
    buildIdentity, credentialRepairRequired: false,
    deviceFingerprint: readiness.deviceIdentityFingerprint, env: args.env,
    evidenceRoot,
    execute: args.execute, existingPairing: true, paths: args.paths,
    remotePeerFingerprint: readiness.syncGroupRemotePeerFingerprint, serial: args.serial
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
