// @vitest-environment node

import { expect, it } from 'vitest';

import {
  classifyPairSyncRecoveryActionFailure, classifyPairSyncRecoveryInstrumentationFailure,
  pairSyncRecoveryModeArgs, pairSyncRecoveryRequiresApproval,
  parsePairSyncRecoveryInstrumentation
} from '../sync-group/pair-sync-feature-contract.mjs';
import { sanitizePairSyncDataProtection } from './windows-a5-pair-sync-recovery-evidence.mjs';
import { validatePairSyncRecoveryResult } from '../sync-group/pair-sync-feature-result.mjs';

it('accepts only the fixed product pairing receipt', () => {
  const output = `INSTRUMENTATION_STATUS: folioleActionReceipt=${JSON.stringify({
    completion: 'http_200', credentials: 'saved_signable', initialSync: 'completed',
    initialSyncRequested: true, ok: true, paired: true,
    pairingPath: 'new',
    targetTestId: 'companion-pair-sync-recovery'
  })}\nINSTRUMENTATION_CODE: -1\n`;
  expect(parsePairSyncRecoveryInstrumentation(output)).toMatchObject({ paired: true });
  expect(() => parsePairSyncRecoveryInstrumentation(output.replace('paired":true', 'paired":false')))
    .toThrow('incomplete');
});

it('routes an approved peer replacement through product re-pair and fresh desktop approval', () => {
  const target = ['-e', 'foliolePairSyncEndpoint', 'http://127.0.0.1:38641'];
  expect(pairSyncRecoveryModeArgs(true)).toEqual([...target, '-e', 'foliolePairSyncMode', 're-pair']);
  expect(pairSyncRecoveryModeArgs(false)).toEqual(target);
  expect(pairSyncRecoveryRequiresApproval(true, true)).toBe(true);
  expect(pairSyncRecoveryRequiresApproval(true, false)).toBe(false);
});

it('allows a purpose-specific join to stop at signable credentials before ordinary sync', () => {
  const approval = { approve_invoked: true, approve_succeeded: true, pending_observed: true };
  expect(validatePairSyncRecoveryResult({
    android: { completion: 'http_200', credentials: 'saved_signable', initialSync: 'started' },
    approval, evidenceGoal: 'credentials-signable', pairingPath: 'new'
  }).android.initialSync).toBe('started');
  expect(() => validatePairSyncRecoveryResult({
    android: { completion: 'http_200', credentials: 'saved_signable', initialSync: 'failed' },
    approval, evidenceGoal: 'credentials-signable', pairingPath: 'new'
  })).toThrow('ordered recovery result');
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
    'java.lang.IllegalStateException: Pairing request failed: key_generation_failed'
  )).toBe('pair_request_key_generation_failed');
  expect(classifyPairSyncRecoveryInstrumentationFailure(
    'java.lang.IllegalStateException: Pairing request failed: request_transport_failed'
  )).toBe('pair_request_transport_failed');
  expect(classifyPairSyncRecoveryInstrumentationFailure(
    'java.lang.IllegalStateException: Pairing request failed: request_rejected'
  )).toBe('pair_request_rejected');
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
    'INSTRUMENTATION_STATUS: foliolePairSyncStage=test-started'
  )).toBe('activity_launch_interrupted');
  expect(classifyPairSyncRecoveryInstrumentationFailure(
    'INSTRUMENTATION_STATUS: foliolePairSyncStage=pair-repair-accepted'
  )).toBe('pair_repair_settlement_interrupted');
  expect(classifyPairSyncRecoveryInstrumentationFailure([
    'INSTRUMENTATION_STATUS: foliolePairSyncStage=pair-completion',
    'INSTRUMENTATION_STATUS: foliolePairSyncEvidence={"completion":"transport_failed","credentials":"not_saved","initialSync":"not_started"}'
  ].join('\n'))).toBe('pair_completion_transport_failed');
  expect(classifyPairSyncRecoveryInstrumentationFailure(
    'INSTRUMENTATION_STATUS: foliolePairSyncStage=initial-sync-pair-target-returned'
  )).toBe('pair_completion_ui_reverted');
  expect(classifyPairSyncRecoveryInstrumentationFailure([
    'INSTRUMENTATION_STATUS: foliolePairSyncStage=pair-request-key-started',
    'INSTRUMENTATION_STATUS: foliolePairSyncStage=pair-request-key-ready',
    'INSTRUMENTATION_STATUS: foliolePairSyncStage=pair-request-dispatched',
    'INSTRUMENTATION_STATUS: foliolePairSyncStage=pair-request-accepted'
  ].join('\n'))).toBe('pair_request_ui_settlement_interrupted');
  expect(classifyPairSyncRecoveryInstrumentationFailure(
    'INSTRUMENTATION_STATUS: foliolePairSyncStage=pair-request-awaiting'
  )).toBe('pair_request_awaiting_interrupted');
  expect(classifyPairSyncRecoveryInstrumentationFailure(
    'INSTRUMENTATION_STATUS: foliolePairSyncStage=forged-stage'
  )).toBe('unknown_instrumentation_failure');
  expect(classifyPairSyncRecoveryActionFailure(
    new Error('masked'), 'pair-sync-instrumentation', 'Timed out waiting for pairing or sync entry.'
  )).toMatchObject({ failureReason: 'pairing_entry_timeout' });
});
