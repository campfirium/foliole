import path from 'node:path';

import { captureWindowsA5Screenshot } from './windows-a5-screenshot.mjs';
import {
  classifyPairSyncRecoveryInstrumentationFailure, parseLatestPairSyncRecoveryHostStage,
  parsePairSyncRecoveryReadiness
} from './windows-a5-pair-sync-recovery-contract.mjs';
import {
  parseLatestPairSyncAndroidEvidence, validatePairSyncAndroidEvidence
} from './windows-a5-pair-sync-recovery-android-evidence.mjs';

export const PAIR_SYNC_FAILURE_SCREENSHOT = 'pair-sync-recovery-failure.png';
export const PAIR_SYNC_FAILURE_DESKTOP_OVERVIEW =
  'pair-sync-recovery-failure-desktop-overview.json';
export const PAIR_SYNC_FAILURE_SUMMARY = 'pair-sync-recovery-failure-summary.json';

export function sanitizePairSyncRecoveryFailureEvidence(value) {
  return {
    ...(value?.screenshot === PAIR_SYNC_FAILURE_SCREENSHOT
      ? { screenshot: PAIR_SYNC_FAILURE_SCREENSHOT } : {}),
    ...(value?.desktopOverview === PAIR_SYNC_FAILURE_DESKTOP_OVERVIEW
      ? { desktopOverview: PAIR_SYNC_FAILURE_DESKTOP_OVERVIEW } : {}),
    ...(value?.summary === PAIR_SYNC_FAILURE_SUMMARY
      ? { summary: PAIR_SYNC_FAILURE_SUMMARY } : {})
  };
}

export function pairSyncRecoveryFailureFiles(value) {
  return Object.values(sanitizePairSyncRecoveryFailureEvidence(value));
}

function writeJson(fsApi, filePath, value) {
  fsApi.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function parseConvergence(output) {
  try { return parsePairSyncRecoveryReadiness(output); }
  catch { return null; }
}

function parseAndroidEvidence(error, output) {
  try {
    return error?.pairSyncAndroidEvidence
      ? validatePairSyncAndroidEvidence(error.pairSyncAndroidEvidence)
      : parseLatestPairSyncAndroidEvidence(output);
  } catch { return parseLatestPairSyncAndroidEvidence(output); }
}

function failureReason(error, output, convergence) {
  if (error?.failureReason) return error.failureReason;
  if (error?.stage === 'pair-sync-instrumentation') {
    return classifyPairSyncRecoveryInstrumentationFailure(output);
  }
  if (error?.stage === 'post-sync-convergence' && convergence?.dirtyRecordCount > 0) {
    return 'dirty_records_not_converged';
  }
  return 'unclassified_failure';
}

export async function collectPairSyncRecoveryFailureEvidence({
  adbPort, env, error, evidenceRoot, execute, fsApi, paths, serial, session
}) {
  const evidence = {};
  const output = error?.result?.output ?? '';
  const stage = /^[a-z][a-z0-9-]{0,63}$/u.test(error?.stage) ? error.stage : 'unknown';
  const convergence = parseConvergence(output);
  const reason = failureReason(error, output, convergence);
  writeJson(fsApi, path.join(evidenceRoot, PAIR_SYNC_FAILURE_SUMMARY), {
    android: parseAndroidEvidence(error, output),
    convergence,
    hostStage: parseLatestPairSyncRecoveryHostStage(output),
    reason, resultStatus: 'failure', schemaVersion: 1, stage
  });
  evidence.summary = PAIR_SYNC_FAILURE_SUMMARY;
  try {
    await captureWindowsA5Screenshot({
      adbPort, env, evidenceRoot, execute, fileName: PAIR_SYNC_FAILURE_SCREENSHOT, fsApi,
      paths, remotePath: '/sdcard/Download/foliole-pair-sync-failure.png', serial,
      stage: 'pair-sync-failure-screenshot'
    });
    evidence.screenshot = PAIR_SYNC_FAILURE_SCREENSHOT;
  } catch { /* Preserve the pairing failure when screenshot capture is unavailable. */ }
  try {
    if (session) {
      const overview = session.sanitize(await session.load());
      writeJson(fsApi, path.join(evidenceRoot, PAIR_SYNC_FAILURE_DESKTOP_OVERVIEW), overview);
      evidence.desktopOverview = PAIR_SYNC_FAILURE_DESKTOP_OVERVIEW;
    }
  } catch { /* Preserve the pairing failure when the desktop overview is unavailable. */ }
  return evidence;
}
