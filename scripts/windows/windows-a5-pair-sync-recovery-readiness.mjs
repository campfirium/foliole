import path from 'node:path';

import { parseCaptureAnnotationReadiness } from './windows-a5-capture-annotation-contract.mjs';
import { parsePairSyncRecoveryReadiness, pairSyncRecoveryFailure } from './windows-a5-pair-sync-recovery-contract.mjs';

function options(env) {
  return { env, timeoutCode: 'pair_sync_readiness_timeout', timeoutMs: 60_000, windowsHide: true };
}

export async function postPairSyncRecoveryReadiness({ deviceFingerprint, env, paths, run, serial }) {
  const workspaceScript = path.join(paths.repoRoot, 'scripts/android/android-capture-annotation-readiness-runner.mjs');
  const pairingScript = path.join(paths.repoRoot, 'scripts/android/android-pair-sync-recovery-readiness-runner.mjs');
  const common = ['--adb', paths.adbPath, '--serial', serial, '--app-id', 'com.foliole.android'];
  const workspaceResult = await run(paths.systemNode, [workspaceScript, ...common], options(env), 'post-sync-readiness');
  const pairingResult = await run(paths.systemNode, [pairingScript, ...common], options(env), 'post-sync-convergence');
  const workspace = parseCaptureAnnotationReadiness(workspaceResult.stdout);
  const pairing = parsePairSyncRecoveryReadiness(pairingResult.stdout);
  if (workspace.resultStatus !== 'ready' || pairing.resultStatus !== 'ready'
      || pairing.deviceIdentityFingerprint !== deviceFingerprint || pairing.dirtyRecordCount !== 0
      || !pairing.pairingCredentialsPresent || pairing.pairingPeerConflict) {
    throw pairSyncRecoveryFailure('Recovered Android workspace did not converge', 'post-sync-convergence');
  }
  return {
    output: workspaceResult.output + pairingResult.output,
    readiness: { ...workspace, dirtyRecordCount: 0, pairingCredentialsPresent: true }
  };
}
