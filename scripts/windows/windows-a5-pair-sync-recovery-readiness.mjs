import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { parseCaptureAnnotationReadiness } from './windows-a5-capture-annotation-contract.mjs';
import { parsePairSyncRecoveryReadiness, pairSyncRecoveryFailure } from './windows-a5-pair-sync-recovery-contract.mjs';

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

function retryableConvergence(pairing, deviceFingerprint) {
  const databaseStarting = pairing.deviceIdentityFingerprint === null
    && pairing.dirtyRecordCount === null
    && pairing.missingPrerequisites.length === 1
    && pairing.missingPrerequisites[0] === 'database_unavailable';
  const dirtyConverging = pairing.deviceIdentityFingerprint === deviceFingerprint
    && pairing.dirtyRecordCount > 0
    && pairing.missingPrerequisites.length === 1
    && pairing.missingPrerequisites[0] === 'unsynced_device_data_requires_review';
  return (databaseStarting || dirtyConverging)
    && pairing.pairingCredentialsPresent
    && !pairing.pairingCredentialsRejected
    && !pairing.pairingPeerConflict;
}

export async function postPairSyncRecoveryReadiness({
  deviceFingerprint, env, maxAttempts = 20, paths, run, serial, wait = delay
}) {
  const workspaceScript = path.join(paths.repoRoot, 'scripts/android/android-capture-annotation-readiness-runner.mjs');
  const pairingScript = path.join(paths.repoRoot, 'scripts/android/android-pair-sync-recovery-readiness-runner.mjs');
  const common = ['--adb', paths.adbPath, '--serial', serial, '--app-id', 'com.foliole.android'];
  const workspaceResult = await run(paths.systemNode, [workspaceScript, ...common], options(env), 'post-sync-readiness');
  let pairingResult;
  let pairing;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    pairingResult = await runReadiness(
      run, paths.systemNode, [pairingScript, ...common], options(env), 'post-sync-convergence'
    );
    pairing = parsePairSyncRecoveryReadiness(pairingResult.stdout);
    if (pairing.resultStatus === 'ready' && pairing.dirtyRecordCount === 0) break;
    if (!retryableConvergence(pairing, deviceFingerprint) || attempt === maxAttempts) break;
    await wait(1_000);
  }
  const workspace = parseCaptureAnnotationReadiness(workspaceResult.stdout);
  if (workspace.resultStatus !== 'ready' || pairing.resultStatus !== 'ready'
      || pairing.deviceIdentityFingerprint !== deviceFingerprint || pairing.dirtyRecordCount !== 0
      || !pairing.pairingCredentialsPresent || pairing.pairingPeerConflict) {
    throw pairSyncRecoveryFailure(
      'Recovered Android workspace did not converge', 'post-sync-convergence', pairingResult
    );
  }
  return {
    output: workspaceResult.output + pairingResult.output,
    readiness: { ...workspace, dirtyRecordCount: 0, pairingCredentialsPresent: true }
  };
}
