/* global AbortController */

import {
  classifyPairSyncRecoveryActionFailure, pairSyncRecoveryFailure
} from './pair-sync-feature-contract.mjs';
import { parseLatestPairSyncAndroidEvidence } from './pair-sync-android-evidence.mjs';

export const PAIR_SYNC_RECOVERY_TIMEOUT_MS = 11 * 60_000;

export function createPairSyncRecoveryWindow({
  now = Date.now, timeoutMs = PAIR_SYNC_RECOVERY_TIMEOUT_MS
} = {}) {
  const controller = new AbortController();
  const deadline = now() + timeoutMs;
  return {
    cancelPairRequest: () => controller.abort(),
    deadline,
    instrumentationTimeoutMs: Math.max(1, deadline - now()),
    signal: controller.signal,
    waitForPairRequest: (pairRequestPromise, instrumentationPromise) =>
      waitForPairRequestWhileInstrumentationRuns(
        pairRequestPromise, instrumentationPromise, () => controller.abort()
      )
  };
}

function completedBeforeRequestFailure(result) {
  return classifyPairSyncRecoveryActionFailure(
    pairSyncRecoveryFailure(
      'Pairing instrumentation completed before the desktop request',
      'pair-sync-instrumentation', result
    ), 'pair-sync-instrumentation', result.output
  );
}

export function waitForPairRequestWhileInstrumentationRuns(
  pairRequestPromise, instrumentationPromise, cancelPairRequest = () => {}
) {
  const earlyInstrumentation = instrumentationPromise.then((result) => {
    throw completedBeforeRequestFailure(result);
  });
  return Promise.race([pairRequestPromise, earlyInstrumentation]).finally(cancelPairRequest);
}

export async function resolvePairSyncConcurrentFailure(primaryError, instrumentationPromise) {
  if (!instrumentationPromise) return primaryError;
  try {
    const result = await instrumentationPromise;
    primaryError.pairSyncAndroidEvidence = parseLatestPairSyncAndroidEvidence(result.output);
    return primaryError;
  } catch (error) {
    primaryError.pairSyncAndroidEvidence = parseLatestPairSyncAndroidEvidence(error.result?.output);
    return primaryError;
  }
}
