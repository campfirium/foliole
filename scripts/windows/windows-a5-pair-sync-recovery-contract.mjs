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

export function classifyPairSyncRecoveryInstrumentationFailure(output) {
  const value = String(output);
  const reasons = [
    ['settings_tab_timeout', /Timed out waiting for semantic target: companion-tab-settings/u],
    ['sync_settings_timeout', /Timed out waiting for semantic target: companion-settings-sync/u],
    ['discovery_button_timeout', /Timed out waiting for semantic target: companion-sync-discover/u],
    ['sync_action_timeout', /Timed out waiting for semantic target: companion-sync-now/u],
    ['pairing_entry_timeout', /Timed out waiting for pairing or sync entry/u],
    ['pair_target_timeout', /Timed out waiting for semantic target: companion-sync-pair/u],
    ['pair_request_rate_limited', /Pairing request failed: request_rate_limited/u],
    ['pair_request_protocol_incompatible', /Pairing request failed: protocol_incompatible/u],
    ['pair_request_invalid', /Pairing request failed: invalid_pair_request/u],
    ['pair_request_transport_failed', /Pairing request failed: desktop_http_failed/u],
    ['pair_request_crypto_failed', /Pairing request failed: pairing_crypto_failed/u],
    ['pair_request_ui_error', /Pairing request failed: request_ui_error/u],
    ['pair_request_observer_unavailable', /Pairing request observer is unavailable/u],
    ['pair_request_key_generation_failed', /Pairing request failed: key_generation_failed/u],
    ['pair_request_transport_failed', /Pairing request failed: request_transport_failed/u],
    ['pair_request_rejected', /Pairing request failed: request_rejected/u],
    ['pair_request_submission_timeout', /Timed out waiting for pairing request submission/u],
    ['pair_completion_ui_reverted', /Pairing completion returned to Pair target/u],
    ['pair_completion_ui_reverted', /Pairing completion returned to discovery/u],
    ['pair_completion_ui_error', /Pairing completion failed:/u],
    ['initial_sync_timeout', /Timed out waiting for initial workspace sync completion/u],
    ['webview_evaluation_stalled', /Timed out while evaluating the WebView semantic action/u],
    ['pair_target_ambiguous', /Pairing target is not unique/u],
    ['pair_target_disappeared', /Pairing target disappeared/u],
    ['semantic_action_failed', /Semantic action failed/u],
    ['window_focus_blocked', /Foliole did not receive window focus/u],
    ['main_launch_missing', /Main launch intent is missing/u],
    ['instrumentation_process_crash', /(?:Process crashed|INSTRUMENTATION_FAILED)/u],
    ['instrumentation_assertion_failure', /AssertionError/u]
  ];
  const knownReason = reasons.find(([, pattern]) => pattern.test(value))?.[0];
  if (knownReason) return knownReason;
  const stages = [...value.matchAll(/^INSTRUMENTATION_STATUS: foliolePairSyncStage=([a-z-]+)$/gmu)];
  const stage = stages.at(-1)?.[1];
  const interruptedStages = {
    'activity-started': 'activity_start_interrupted',
    'window-focused': 'webview_lookup_interrupted',
    'webview-ready': 'webview_snapshot_interrupted',
    'settings-tab': 'settings_navigation_interrupted',
    'sync-settings': 'sync_settings_navigation_interrupted',
    'sync-entry': 'sync_entry_interrupted',
    'discovery-request': 'discovery_request_interrupted',
    'pair-target': 'pair_target_interrupted',
    'pair-request': 'pair_request_interrupted',
    'pair-request-submitted': 'pair_request_submitted_interrupted',
    'pair-request-key-started': 'pair_request_key_generation_interrupted',
    'pair-request-key-ready': 'pair_request_pre_dispatch_interrupted',
    'pair-request-dispatched': 'pair_request_dispatch_interrupted',
    'pair-request-accepted': 'pair_request_ui_settlement_interrupted',
    'pair-request-awaiting': 'pair_request_awaiting_interrupted',
    'initial-sync': 'initial_sync_interrupted',
    'initial-sync-awaiting': 'pair_completion_wait_interrupted',
    'initial-sync-pair-target-returned': 'pair_completion_ui_reverted'
  };
  return interruptedStages[stage] ?? 'unknown_instrumentation_failure';
}

export function classifyPairSyncRecoveryActionFailure(failure, stage, output) {
  if (stage === 'pair-sync-instrumentation') {
    failure.failureReason = classifyPairSyncRecoveryInstrumentationFailure(output);
  }
  return failure;
}

export function pairSyncRecoveryArtifactPaths(evidenceRoot) {
  return Object.fromEntries(PAIR_SYNC_RECOVERY_EVIDENCE_FILES.map(
    (name) => [name, path.join(evidenceRoot, name)]
  ));
}
