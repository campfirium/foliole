import path from 'node:path';

import {
  parseLatestPairSyncAndroidEvidence, validatePairSyncAndroidEvidence
} from './windows-a5-pair-sync-recovery-android-evidence.mjs';

export { createPairSyncRecoveryEvidenceTracker } from './windows-a5-pair-sync-recovery-result.mjs';

export const PAIR_SYNC_RECOVERY_EVIDENCE_FILES = [
  'pair-sync-recovery-manifest.json',
  'pair-sync-recovery-receipt.json',
  'pair-sync-recovery-android-readiness.json',
  'pair-sync-recovery-desktop-overview.json'
];

export const PAIR_SYNC_RECOVERY_APP_ID = 'com.foliole.android';
export const PAIR_SYNC_RECOVERY_MAIN_COMPONENT = `${PAIR_SYNC_RECOVERY_APP_ID}/com.foliole.android.MainActivity`;
export const PAIR_SYNC_RECOVERY_TEST_APP_ID = `${PAIR_SYNC_RECOVERY_APP_ID}.test`;
export const PAIR_SYNC_RECOVERY_TEST_METHOD = 'recoversPairingAndInitialSync';
export const PAIR_SYNC_RECOVERY_TEST_CLASS_NAME =
  `${PAIR_SYNC_RECOVERY_APP_ID}.FolioleCompanionWebViewAutomationTest`;
export const PAIR_SYNC_RECOVERY_TEST_CLASS =
  `${PAIR_SYNC_RECOVERY_TEST_CLASS_NAME}#${PAIR_SYNC_RECOVERY_TEST_METHOD}`;
export const PAIR_SYNC_RECOVERY_TEST_RUNNER =
  `${PAIR_SYNC_RECOVERY_TEST_APP_ID}/androidx.test.runner.AndroidJUnitRunner`;

export function pairSyncRecoveryModeArgs(rePairRequired) {
  const target = ['-e', 'foliolePairSyncEndpoint', 'http://127.0.0.1:38641'];
  return rePairRequired ? [...target, '-e', 'foliolePairSyncMode', 're-pair'] : target;
}

export function pairSyncRecoveryRequiresApproval(existingPairing, rePairRequired) {
  return !existingPairing || rePairRequired;
}

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
    activeSyncGroupMemberCount: Number.isSafeInteger(value.activeSyncGroupMemberCount)
      ? value.activeSyncGroupMemberCount : null,
    deviceIdentityFingerprint: value.deviceIdentityFingerprint,
    dirtyRecordCount: value.dirtyRecordCount,
    missingPrerequisites: [...value.missingPrerequisites],
    latestSyncRunResult: typeof value.latestSyncRunResult === 'string'
      ? value.latestSyncRunResult : null,
    latestSyncRunStatus: typeof value.latestSyncRunStatus === 'string'
      ? value.latestSyncRunStatus : null,
    latestSyncWaitingConfirmationCount: Number.isSafeInteger(
      value.latestSyncWaitingConfirmationCount
    ) ? value.latestSyncWaitingConfirmationCount : 0,
    latestSyncWaitingSendCount: Number.isSafeInteger(value.latestSyncWaitingSendCount)
      ? value.latestSyncWaitingSendCount : 0,
    nodeCount: value.nodeCount,
    pairingCredentialsPresent: value.pairingCredentialsPresent === true,
    pairingCredentialRejectionReason: [
      'expired_timestamp', 'invalid_signature', 'missing_headers', 'unknown_device'
    ].includes(value.pairingCredentialRejectionReason) ? value.pairingCredentialRejectionReason : null,
    pairingCredentialsRejected: value.pairingCredentialsRejected === true,
    pairingPeerConflict: value.pairingPeerConflict === true,
    remotePeerFingerprint: /^[0-9a-f]{16}$/u.test(value.remotePeerFingerprint)
      ? value.remotePeerFingerprint : null,
    resultStatus: value.resultStatus,
    schemaVersion: 1,
    syncGroupCredentialsPresent: value.syncGroupCredentialsPresent === true,
    syncGroupId: typeof value.syncGroupId === 'string' ? value.syncGroupId : null,
    syncGroupPeerConflict: value.syncGroupPeerConflict === true,
    syncGroupRemotePeerPendingDeliveryCount: Number.isSafeInteger(
      value.syncGroupRemotePeerPendingDeliveryCount
    ) ? value.syncGroupRemotePeerPendingDeliveryCount : null,
    syncGroupRemotePeerFingerprint: /^[0-9a-f]{16}$/u.test(
      value.syncGroupRemotePeerFingerprint
    ) ? value.syncGroupRemotePeerFingerprint : null,
    syncGroupTimelineId: typeof value.syncGroupTimelineId === 'string'
      ? value.syncGroupTimelineId : null
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
  let android;
  try { android = validatePairSyncAndroidEvidence(receipt); }
  catch { throw pairSyncRecoveryFailure('Pair sync recovery receipt is incomplete', 'pair-sync-instrumentation'); }
  return {
    ...android,
    initialSyncRequested: true,
    ok: true,
    paired: true,
    pairingPath: receipt.pairingPath,
    targetTestId: 'companion-pair-sync-recovery'
  };
}

export function parsePairSyncRecoveryInstrumentationResult(result) {
  try { return parsePairSyncRecoveryInstrumentation(result.stdout); }
  catch (error) {
    error.result ??= result;
    throw classifyPairSyncRecoveryActionFailure(error, 'pair-sync-instrumentation', result.output);
  }
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
    ['pair_sync_observer_unavailable', /Pair sync observer is unavailable/u],
    ['pair_request_key_generation_failed', /Pairing request failed: key_generation_failed/u],
    ['pair_request_transport_failed', /Pairing request failed: request_transport_failed/u],
    ['pair_request_rejected', /Pairing request failed: request_rejected/u],
    ['pair_request_submission_timeout', /Timed out waiting for pairing request submission/u],
    ['pair_completion_ui_reverted', /Pairing completion returned to Pair target/u],
    ['pair_completion_ui_reverted', /Pairing completion returned to discovery/u],
    ['pair_completion_ui_error', /Pairing completion failed:/u],
    ['initial_sync_timeout', /Timed out waiting for initial workspace sync completion/u],
    ['initial_sync_busy_timeout', /initial workspace sync settlement: target_disabled/u],
    ['initial_sync_surface_missing', /initial workspace sync settlement: target_missing/u],
    ['initial_sync_needs_attention', /Initial workspace sync settled with attention/u],
    ['existing_sync_failed', /Existing workspace sync failed/u],
    ['initial_sync_settlement_timeout', /Timed out waiting for initial workspace sync settlement/u],
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
  const android = parseLatestPairSyncAndroidEvidence(value);
  if (android?.completion === 'transport_failed') return 'pair_completion_transport_failed';
  if (android?.completion === 'http_rejected') return 'pair_completion_http_rejected';
  if (android?.credentials === 'save_failed') return 'pair_credentials_save_failed';
  if (android?.initialSync === 'failed') return 'initial_sync_failed';
  const stages = [...value.matchAll(/^INSTRUMENTATION_STATUS: foliolePairSyncStage=([a-z-]+)$/gmu)];
  const stage = stages.at(-1)?.[1];
  const interruptedStages = {
    'activity-started': 'activity_start_interrupted',
    'window-focused': 'webview_lookup_interrupted',
    'webview-ready': 'webview_snapshot_interrupted',
    'settings-tab': 'settings_navigation_interrupted',
    'sync-settings': 'sync_settings_navigation_interrupted',
    'sync-entry': 'sync_entry_interrupted',
    'existing-pair-disconnect': 'existing_pair_disconnect_interrupted',
    'discovery-request': 'discovery_request_interrupted',
    'pair-target': 'pair_target_interrupted',
    'pair-request': 'pair_request_interrupted',
    'pair-request-submitted': 'pair_request_submitted_interrupted',
    'pair-request-key-started': 'pair_request_key_generation_interrupted',
    'pair-request-key-ready': 'pair_request_pre_dispatch_interrupted',
    'pair-request-dispatched': 'pair_request_dispatch_interrupted',
    'pair-request-accepted': 'pair_request_ui_settlement_interrupted',
    'pair-request-awaiting': 'pair_request_awaiting_interrupted',
    'initial-sync-request': 'initial_sync_request_interrupted',
    'pair-completion': 'pair_completion_wait_interrupted',
    'pair-completion-dispatched': 'pair_completion_dispatch_interrupted',
    'pair-completion-http-200': 'pair_credentials_save_interrupted',
    'credentials-saved': 'pair_credentials_signing_interrupted',
    'credentials-signable': 'initial_sync_start_interrupted',
    'initial-sync-started': 'initial_sync_interrupted',
    'structure-pack-downloaded': 'structure_pack_apply_interrupted',
    'structure-pack-applied': 'initial_sync_settlement_interrupted',
    'initial-sync-completed': 'initial_sync_ui_settlement_interrupted',
    'initial-sync-awaiting': 'pair_completion_wait_interrupted',
    'initial-sync-pair-target-returned': 'pair_completion_ui_reverted'
  };
  return interruptedStages[stage] ?? 'unknown_instrumentation_failure';
}

export function parseLatestPairSyncRecoveryHostStage(output) {
  const stages = [...String(output).matchAll(
    /^INSTRUMENTATION_STATUS: foliolePairSyncStage=([a-z][a-z-]{0,63})$/gmu
  )];
  return stages.at(-1)?.[1] ?? null;
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
