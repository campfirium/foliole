import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { parsePairSyncRecoveryReadiness, pairSyncRecoveryFailure } from './pair-sync-feature-contract.mjs';

function options(env) {
  return { env, timeoutCode: 'pair_sync_readiness_timeout', timeoutMs: 60_000, windowsHide: true };
}

async function runReadiness(run, command, args, commandOptions, stage) {
  try { return await run(command, args, commandOptions, stage); }
  catch (error) {
    if (error?.result?.code === 77) return error.result;
    throw error;
  }
}

function retryableConvergence(pairing) {
  const databaseStarting = pairing.localMemberAuthorizationFingerprint === null
    && pairing.dirtyRecordCount === null
    && pairing.missingPrerequisites.length === 1
    && pairing.missingPrerequisites[0] === 'database_unavailable';
  const dirtyConverging = pairing.localMemberAuthorizationFingerprint
    && pairing.dirtyRecordCount > 0
    && pairing.missingPrerequisites.length === 1
    && pairing.missingPrerequisites[0] === 'unsynced_device_data_requires_review';
  const peerDeliveryConverging = pairing.localMemberAuthorizationFingerprint
    && (pairing.syncGroupRemotePeerPendingDeliveryCount ?? 0) > 0;
  return (databaseStarting || dirtyConverging || peerDeliveryConverging)
    && pairing.syncGroupCredentialsPresent
    && !pairing.syncGroupPeerConflict;
}

export async function postPairSyncRecoveryReadiness({
  adbPort, afterSnapshot, beforeSnapshot, env, maxAttempts = 60,
  paths, quiesceProvider = false, run, serial, wait = delay
}) {
  beforeSnapshot ??= quiesceProvider ? () => run(paths.adbPath, [
    '-P', adbPort, '-s', serial, 'shell', 'am', 'force-stop', 'com.foliole.android'
  ], options(env), 'post-sync-snapshot') : async () => {};
  afterSnapshot ??= quiesceProvider ? () => run(paths.adbPath, [
    '-P', adbPort, '-s', serial, 'shell', 'am', 'start', '-W', '-n',
    'com.foliole.android/com.foliole.android.MainActivity'
  ], options(env), 'post-sync-snapshot') : async () => {};
  const pairingScript = path.join(paths.repoRoot, 'scripts/android/android-pair-sync-recovery-readiness-runner.mjs');
  const common = ['--adb', paths.adbPath, '--serial', serial, '--app-id', 'com.foliole.android'];
  let pairingResult;
  let pairing;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (quiesceProvider) await wait(8_000);
    await beforeSnapshot();
    try {
      pairingResult = await runReadiness(
        run, paths.systemNode, [pairingScript, ...common], options(env), 'post-sync-convergence'
      );
    } finally {
      await afterSnapshot();
    }
    pairing = parsePairSyncRecoveryReadiness(pairingResult.stdout);
    if (/^[0-9a-f]{16}$/u.test(pairing.localMemberAuthorizationFingerprint ?? '')
        && pairing.syncGroupRemotePeerPendingDeliveryCount === 0) break;
    if (!retryableConvergence(pairing) || attempt === maxAttempts) break;
    await wait(1_000);
  }
  if (!/^[0-9a-f]{16}$/u.test(pairing.localMemberAuthorizationFingerprint ?? '')
      || pairing.syncGroupRemotePeerPendingDeliveryCount !== 0
      || !pairing.syncGroupCredentialsPresent || pairing.syncGroupPeerConflict
      || !/^[0-9a-f]{16}$/u.test(pairing.syncGroupRemotePeerFingerprint ?? '')
      || pairing.activeSyncGroupMemberCount < 2
      || !pairing.syncGroupId || !pairing.syncGroupTimelineId) {
    throw pairSyncRecoveryFailure(
      'Recovered Android workspace did not converge', 'post-sync-convergence', pairingResult
    );
  }
  return {
    output: pairingResult.output,
    readiness: pairing
  };
}
