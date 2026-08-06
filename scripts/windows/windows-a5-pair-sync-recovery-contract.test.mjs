// @vitest-environment node

import fs from 'node:fs';
import { URL } from 'node:url';
import vm from 'node:vm';

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
    completion: 'http_200', credentials: 'saved_signable', initialSync: 'completed',
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

it('observes request submission without global errors or click-return evidence', () => {
  const source = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionPairSyncRecoveryScenario.java',
    'utf8'
  );
  const evidence = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionPairRequestEvidence.java',
    'utf8'
  );
  const adapter = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionWebViewSemanticAdapter.java',
    'utf8'
  );
  const recoveryEvidence = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionPairSyncEvidence.java',
    'utf8'
  );
  const observer = fs.readFileSync(
    'android/app/src/androidTest/assets/foliole-pair-sync-evidence-observer.js',
    'utf8'
  );
  expect(source.indexOf('installPairSyncObserver')).toBeLessThan(
    source.indexOf('clickVisible(instrumentation, webView, "companion-sync-pair"')
  );
  expect(source).toContain('clickVisible(instrumentation, webView, CONNECTED_TARGET, deadline)');
  expect(source).not.toContain('"companion-sync-disconnect"');
  expect(source).toContain('SETTINGS_TARGET, REVIEW_EXIT_TARGET');
  expect(source).toContain('clickVisible(instrumentation, webView, REVIEW_EXIT_TARGET, deadline)');
  expect(source).not.toContain('&& state.optBoolean("connectedFound")');
  expect(source).not.toContain('__actionAccepted');
  expect(evidence).toContain('"accepted".equals(state.optString("requestState"))');
  expect(adapter).not.toContain("document.querySelector('.text-error')");
  expect(recoveryEvidence).toContain('foliole-pair-sync-evidence-observer.js');
  expect(observer).toContain("methodName === 'desktopHttpRequest'");
  expect(observer).toContain("methodName === 'savePairingCredentials'");
  expect(observer).toContain("methodName === 'signCompanionSyncRequest'");
  expect(observer).toContain("methodName === 'recordWorkspaceSyncEvent'");
  expect(observer).toContain("kind === 'run_finished' && state.initialSync === 'started'");
  expect(observer).toContain("algorithm.name === 'ECDH'");
  expect(observer).not.toContain('pair_request_id');
});

it('attributes request evidence only to the product pair-request operation', async () => {
  const source = fs.readFileSync(
    'android/app/src/androidTest/assets/foliole-pair-sync-evidence-observer.js', 'utf8'
  );
  const calls = [];
  const cryptoPrototype = { generateKey: async () => ({}) };
  const window = {
    Capacitor: { nativePromise: async (_plugin, _method, args) => { calls.push(args); return { status: 202 }; } },
    crypto: { subtle: Object.create(cryptoPrototype) }
  };
  expect(JSON.parse(vm.runInNewContext(source, { Promise, URL, window }))).toEqual({ ok: true });
  const request = (args) => window.Capacitor.nativePromise('FolioleCompanionSync', 'desktopHttpRequest', args);

  await request({ method: 'GET', url: 'http://127.0.0.1:38641/companion/discovery' });
  await request({ method: 'POST', url: 'http://127.0.0.1:38641/companion/pair' });
  await request({ method: 'POST', url: 'http://127.0.0.1:38641/other' });
  expect(window.__foliolePairSyncObserver.requestState).toBe('not-started');

  await request({ method: 'POST', url: 'http://127.0.0.1:38641/companion/pair-requests' });
  expect(window.__foliolePairSyncObserver.requestState).toBe('accepted');
  expect(calls).toHaveLength(4);
});
