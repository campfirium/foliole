import path from 'node:path';

export const PAIR_SYNC_RECOVERY_EVIDENCE_FILES = [
  'pair-sync-recovery-manifest.json',
  'pair-sync-recovery-receipt.json',
  'pair-sync-recovery-android-readiness.json',
  'pair-sync-recovery-desktop-overview.json',
  'pair-sync-recovery-data-protection.json'
];

export const PAIR_SYNC_RECOVERY_APP_ID = 'com.foliole.android';
export const PAIR_SYNC_RECOVERY_TEST_APP_ID = `${PAIR_SYNC_RECOVERY_APP_ID}.test`;
export const PAIR_SYNC_RECOVERY_TEST_METHOD = 'recoversPairingAndInitialSync';
export const PAIR_SYNC_RECOVERY_TEST_CLASS_NAME =
  `${PAIR_SYNC_RECOVERY_APP_ID}.FolioleCompanionWebViewAutomationTest`;
export const PAIR_SYNC_RECOVERY_TEST_CLASS =
  `${PAIR_SYNC_RECOVERY_TEST_CLASS_NAME}#${PAIR_SYNC_RECOVERY_TEST_METHOD}`;
export const PAIR_SYNC_RECOVERY_TEST_RUNNER =
  `${PAIR_SYNC_RECOVERY_TEST_APP_ID}/androidx.test.runner.AndroidJUnitRunner`;

export function pairSyncRecoveryFailure(message, stage, result, exitCode = 74) {
  return Object.assign(new Error(message), { exitCode, result, stage });
}

export function parsePairSyncRecoveryReadiness(output) {
  const prefix = '[android-data] pair-sync-recovery-readiness=';
  const line = String(output).split(/\r?\n/u).find((entry) => entry.startsWith(prefix));
  if (!line) throw pairSyncRecoveryFailure('Pair sync recovery readiness evidence is missing', 'pair-sync-readiness');
  let value;
  try { value = JSON.parse(line.slice(prefix.length)); }
  catch { throw pairSyncRecoveryFailure('Pair sync recovery readiness evidence is invalid', 'pair-sync-readiness'); }
  if (value?.schemaVersion !== 1 || !['ready', 'approval_required'].includes(value.resultStatus)
      || !Array.isArray(value.missingPrerequisites)
      || (value.deviceIdentityFingerprint !== null
        && !/^[0-9a-f]{16}$/u.test(value.deviceIdentityFingerprint))) {
    throw pairSyncRecoveryFailure('Pair sync recovery readiness evidence is incomplete', 'pair-sync-readiness');
  }
  return {
    deviceIdentityFingerprint: value.deviceIdentityFingerprint,
    dirtyRecordCount: value.dirtyRecordCount,
    missingPrerequisites: [...value.missingPrerequisites],
    nodeCount: value.nodeCount,
    pairingCredentialsPresent: value.pairingCredentialsPresent === true,
    pairingPeerConflict: value.pairingPeerConflict === true,
    remotePeerFingerprint: /^[0-9a-f]{16}$/u.test(value.remotePeerFingerprint)
      ? value.remotePeerFingerprint : null,
    resultStatus: value.resultStatus,
    schemaVersion: 1
  };
}

function parseBundle(output, key) {
  const prefix = `INSTRUMENTATION_STATUS: ${key}=`;
  const line = String(output).split(/\r?\n/u).find((entry) => entry.startsWith(prefix));
  if (!line) throw pairSyncRecoveryFailure(`Instrumentation did not emit ${key}`, 'pair-sync-instrumentation');
  try { return JSON.parse(line.slice(prefix.length)); }
  catch { throw pairSyncRecoveryFailure(`Instrumentation emitted invalid ${key}`, 'pair-sync-instrumentation'); }
}

export function parsePairSyncRecoveryInstrumentation(output) {
  if (!/^INSTRUMENTATION_CODE: -1$/mu.test(output)) {
    throw pairSyncRecoveryFailure('Pair sync recovery instrumentation failed', 'pair-sync-instrumentation');
  }
  const receipt = parseBundle(output, 'folioleActionReceipt');
  if (receipt.ok !== true || receipt.targetTestId !== 'companion-pair-sync-recovery'
      || receipt.paired !== true || receipt.initialSyncRequested !== true
      || !['existing', 'new'].includes(receipt.pairingPath)) {
    throw pairSyncRecoveryFailure('Pair sync recovery receipt is incomplete', 'pair-sync-instrumentation');
  }
  return receipt;
}

export function pairSyncRecoveryArtifactPaths(evidenceRoot) {
  return Object.fromEntries(PAIR_SYNC_RECOVERY_EVIDENCE_FILES.map(
    (name) => [name, path.join(evidenceRoot, name)]
  ));
}
