import {
  classifyPairSyncRecoveryActionFailure, pairSyncRecoveryFailure
} from './windows-a5-pair-sync-recovery-contract.mjs';
import { parseLatestPairSyncAndroidEvidence } from './windows-a5-pair-sync-recovery-android-evidence.mjs';

function completedBeforeRequestFailure(result) {
  return classifyPairSyncRecoveryActionFailure(
    pairSyncRecoveryFailure(
      'Pairing instrumentation completed before the desktop request',
      'pair-sync-instrumentation', result
    ), 'pair-sync-instrumentation', result.output
  );
}

export function waitForPairRequestWhileInstrumentationRuns(
  pairRequestPromise, instrumentationPromise
) {
  const earlyInstrumentation = instrumentationPromise.then((result) => {
    throw completedBeforeRequestFailure(result);
  });
  return Promise.race([pairRequestPromise, earlyInstrumentation]);
}

export async function resolvePairSyncConcurrentFailure(primaryError, instrumentationPromise) {
  if (!instrumentationPromise) return primaryError;
  try {
    const result = await instrumentationPromise;
    primaryError.pairSyncAndroidEvidence = parseLatestPairSyncAndroidEvidence(result.output);
    return primaryError.stage === 'desktop-pair-request'
      ? completedBeforeRequestFailure(result) : primaryError;
  } catch (error) {
    primaryError.pairSyncAndroidEvidence = parseLatestPairSyncAndroidEvidence(error.result?.output);
    return primaryError.stage === 'desktop-pair-request' ? error : primaryError;
  }
}
