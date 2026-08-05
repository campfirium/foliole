// @vitest-environment node

import { expect, it } from 'vitest';

import {
  classifyPairSyncRecoveryActionFailure, classifyPairSyncRecoveryInstrumentationFailure,
  parsePairSyncRecoveryInstrumentation, parsePairSyncRecoveryReadiness
} from './windows-a5-pair-sync-recovery-contract.mjs';
import { sanitizePairSyncDataProtection } from './windows-a5-pair-sync-recovery-evidence.mjs';

it('keeps readiness evidence non-sensitive and fails closed', () => {
  const readiness = parsePairSyncRecoveryReadiness(
    `[android-data] pair-sync-recovery-readiness=${JSON.stringify({
      deviceIdentityFingerprint: '0123456789abcdef', dirtyRecordCount: 0,
      missingPrerequisites: [], nodeCount: 0, pairingCredentialsPresent: false,
      pairingPeerConflict: false,
      remotePeerFingerprint: null,
      resultStatus: 'ready', schemaVersion: 1, endpoint: 'must-be-dropped'
    })}`
  );
  expect(readiness).not.toHaveProperty('endpoint');
  expect(readiness).toMatchObject({ resultStatus: 'ready' });
});

it('accepts only the fixed product pairing receipt', () => {
  const output = `INSTRUMENTATION_STATUS: folioleActionReceipt=${JSON.stringify({
    initialSyncRequested: true, ok: true, paired: true,
    pairingPath: 'new',
    targetTestId: 'companion-pair-sync-recovery'
  })}\nINSTRUMENTATION_CODE: -1\n`;
  expect(parsePairSyncRecoveryInstrumentation(output)).toMatchObject({ paired: true });
  expect(() => parsePairSyncRecoveryInstrumentation(output.replace('paired":true', 'paired":false')))
    .toThrow('incomplete');
});

it('removes device paths and raw snapshot details from data-protection evidence', () => {
  const evidence = sanitizePairSyncDataProtection({
    backup: { created: true, databasePath: 'C:\\secret\\device.db' },
    snapshot: { database: { counts: { nodes: 0 }, path: 'C:\\secret\\pulled.db' }, serial: 'raw-serial' }
  });
  expect(evidence).toEqual({ backupCreated: true, databasePreserved: true, nodeCountBefore: 0, schemaVersion: 1 });
  expect(JSON.stringify(evidence)).not.toContain('secret');
  expect(JSON.stringify(evidence)).not.toContain('serial');
});

it('reduces instrumentation output to a fixed non-sensitive failure reason', () => {
  expect(classifyPairSyncRecoveryInstrumentationFailure(
    'java.lang.IllegalStateException: Timed out waiting for pairing or sync entry. endpoint=secret'
  )).toBe('pairing_entry_timeout');
  expect(classifyPairSyncRecoveryInstrumentationFailure('unexpected endpoint=secret'))
    .toBe('unknown_instrumentation_failure');
  expect(classifyPairSyncRecoveryInstrumentationFailure(
    'IllegalStateException: Timed out waiting for semantic target: companion-sync-discover'
  )).toBe('discovery_button_timeout');
  expect(classifyPairSyncRecoveryInstrumentationFailure(
    'INSTRUMENTATION_RESULT: shortMsg=Process crashed.'
  )).toBe('instrumentation_process_crash');
  expect(classifyPairSyncRecoveryInstrumentationFailure(
    'java.lang.IllegalStateException: Pairing request failed: pairing_crypto_failed'
  )).toBe('pair_request_crypto_failed');
  expect(classifyPairSyncRecoveryInstrumentationFailure(
    'java.lang.IllegalStateException: Pairing request failed: request_rate_limited'
  )).toBe('pair_request_rate_limited');
  expect(classifyPairSyncRecoveryInstrumentationFailure(
    'java.lang.IllegalStateException: Pairing completion returned to Pair target.'
  )).toBe('pair_completion_ui_reverted');
  expect(classifyPairSyncRecoveryInstrumentationFailure(
    'java.lang.IllegalStateException: Timed out while evaluating the WebView semantic action.'
  )).toBe('webview_evaluation_stalled');
  expect(classifyPairSyncRecoveryInstrumentationFailure([
    'INSTRUMENTATION_STATUS: foliolePairSyncStage=webview-ready',
    'INSTRUMENTATION_STATUS: foliolePairSyncStage=discovery-request',
    'INSTRUMENTATION_STATUS: foliolePairSyncStage=pair-target'
  ].join('\n'))).toBe('pair_target_interrupted');
  expect(classifyPairSyncRecoveryInstrumentationFailure(
    'INSTRUMENTATION_STATUS: foliolePairSyncStage=initial-sync-awaiting'
  )).toBe('pair_completion_wait_interrupted');
  expect(classifyPairSyncRecoveryInstrumentationFailure(
    'INSTRUMENTATION_STATUS: foliolePairSyncStage=initial-sync-pair-target-returned'
  )).toBe('pair_completion_ui_reverted');
  expect(classifyPairSyncRecoveryInstrumentationFailure(
    'INSTRUMENTATION_STATUS: foliolePairSyncStage=forged-stage'
  )).toBe('unknown_instrumentation_failure');
  expect(classifyPairSyncRecoveryActionFailure(
    new Error('masked'), 'pair-sync-instrumentation', 'Timed out waiting for pairing or sync entry.'
  )).toMatchObject({ failureReason: 'pairing_entry_timeout' });
});
