// @vitest-environment node

import fs from 'node:fs';
import { URL } from 'node:url';
import vm from 'node:vm';

import { expect, it } from 'vitest';

const read = (name) => fs.readFileSync(name, 'utf8');
const observerPath = 'android/app/src/androidTest/assets/foliole-pair-sync-evidence-observer.js';

it('observes request submission without global errors or click-return evidence', () => {
  const source = read('android/app/src/androidTest/java/com/foliole/android/FolioleCompanionPairSyncRecoveryScenario.java');
  const automation = read('android/app/src/androidTest/java/com/foliole/android/FolioleCompanionWebViewAutomationTest.java');
  const launcher = read('android/app/src/androidTest/java/com/foliole/android/FolioleCompanionActivityLauncher.java');
  const waiter = read('android/app/src/androidTest/java/com/foliole/android/FolioleCompanionPairSyncRecoveryEvidenceWaiter.java');
  const evidence = read('android/app/src/androidTest/java/com/foliole/android/FolioleCompanionPairRequestEvidence.java');
  const adapter = read('android/app/src/androidTest/java/com/foliole/android/FolioleCompanionWebViewSemanticAdapter.java');
  const recoveryEvidence = read('android/app/src/androidTest/java/com/foliole/android/FolioleCompanionPairSyncEvidence.java');
  const targetSelection = read('android/app/src/androidTest/java/com/foliole/android/FolioleCompanionPairSyncTargetSelection.java');
  const observer = read(observerPath);
  expect(source.indexOf('installPairSyncObserver')).toBeLessThan(
    source.indexOf('FolioleCompanionPairSyncTargetSelection.click')
  );
  expect(targetSelection).toContain('"data-sync-endpoint",');
  expect(targetSelection).toContain('expectedEndpointUrl, deadline');
  expect(source).toContain('clickVisible(instrumentation, webView, CONNECTED_TARGET, deadline)');
  const rePairGuard = source.indexOf('if (existingPairing && forceRePair)');
  const disconnect = source.indexOf('"companion-sync-disconnect"');
  expect(disconnect).toBeGreaterThan(rePairGuard);
  expect(disconnect).toBeLessThan(source.indexOf('else if (existingPairing)', rePairGuard));
  expect(source).toContain('SETTINGS_TARGET, REVIEW_EXIT_TARGET');
  expect(source).not.toContain('__actionAccepted');
  expect(evidence).toContain('"accepted".equals(state.optString("requestState"))');
  expect(adapter).not.toContain("document.querySelector('.text-error')");
  expect(adapter).toContain('webView.post(() -> webView.evaluateJavascript');
  expect(adapter).not.toContain('runOnMainSync(() -> webView.evaluateJavascript');
  expect(automation).toContain('activity.runOnUiThread(activity::finish);');
  expect(automation).toContain('FolioleCompanionActivityLauncher.start(instrumentation, 30_000)');
  expect(automation.indexOf('"test-started"')).toBeLessThan(
    automation.indexOf('FolioleCompanionActivityLauncher.start')
  );
  expect(launcher).toContain('waitForMonitorWithTimeout(monitor, timeoutMs)');
  expect(launcher).not.toContain('startActivitySync');
  expect(recoveryEvidence).toContain('foliole-pair-sync-evidence-observer.js');
  expect(waiter).toContain('awaitAfterStructureApplied');
  expect(waiter).toContain('credentialsOnly && "saved_signable"');
  expect(waiter).not.toContain('verifyCredentials');
  expect(recoveryEvidence).not.toContain('verifyCredentials');
  for (const method of ['desktopHttpRequest', 'savePairingCredentials', 'signCompanionSyncRequest',
    'bindSyncGroupPeerRoute', 'downloadDesktopSyncPack', 'deleteDownloadedSyncPack']) {
    expect(observer).toContain(method);
  }
  expect(observer).toContain("pluginName === 'FolioleCompanionSyncPackTransfer'");
  expect(observer).toContain("new URL(args.url).pathname === '/companion/sync-push'");
  expect(observer).not.toContain("new URL(args.url).pathname === '/companion/sync-group/activate'");
  const settlement = read('android/app/src/androidTest/java/com/foliole/android/FolioleCompanionExistingPairSyncEvidence.java');
  expect(settlement).toContain('companion-sync-inline-progress');
  expect(settlement).toContain('restoreSyncSurface');
  expect(observer).not.toContain("methodName === 'recordWorkspaceSyncEvent'");
  expect(observer).toContain("algorithm.name === 'ECDH'");
  expect(observer).not.toContain('pair_request_id');
  expect(observer).not.toContain('__folioleVerifyPairSyncCredentials');
  expect(observer).not.toContain('args.workgroup_key');
  expect(observer).not.toMatch(/\bworkgroup_key\s*:/u);
});

it('only observes the product signing request after workgroup membership persistence', async () => {
  const source = read(observerPath);
  const window = { Capacitor: { nativePromise: async () => ({ ok: true }) },
    crypto: { subtle: Object.create({ generateKey: async () => ({}) }) } };
  expect(JSON.parse(vm.runInNewContext(source, { Promise, URL, window }))).toEqual({ ok: true });
  const state = window.__foliolePairSyncObserver;
  state.completion = 'http_200';
  await window.Capacitor.nativePromise('FolioleCompanionSync', 'bindSyncGroupPeerRoute', {
    endpoint_url: 'http://127.0.0.1:38641', sync_group_id: 'group-1'
  });
  expect(state.credentials).toBe('saved_not_signable');
  await window.Capacitor.nativePromise('FolioleCompanionSync', 'signCompanionSyncRequest', {
    endpoint_url: 'http://127.0.0.1:38641', sync_group_id: 'group-1',
    workgroup_key: 'product-owned-key'
  });
  expect(state.credentials).toBe('saved_signable');
});

it('attributes request evidence only to the product pair-request operation', async () => {
  const source = read(observerPath);
  const calls = [];
  const window = { Capacitor: { nativePromise: async (_plugin, _method, args) => {
    calls.push(args); return { status: 202 };
  } }, crypto: { subtle: Object.create({ generateKey: async () => ({}) }) } };
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

it('bounds pair completion HTTP failure evidence to status and known error code', async () => {
  const source = read(observerPath);
  const window = { Capacitor: { nativePromise: async () => ({
    body: JSON.stringify({ error: 'pair_request_pending', private: 'hidden' }), status: 409
  }) }, crypto: { subtle: Object.create({ generateKey: async () => ({}) }) } };
  expect(JSON.parse(vm.runInNewContext(source, { Promise, URL, window }))).toEqual({ ok: true });
  window.__foliolePairSyncObserver.requestState = 'accepted';
  await window.Capacitor.nativePromise('FolioleCompanionSync', 'desktopHttpRequest', {
    method: 'POST', url: 'http://127.0.0.1:38641/companion/pair'
  });
  expect(window.__foliolePairSyncObserver).toMatchObject({
    completion: 'http_rejected', syncFailure: 'pair-completion-http-409-pair_request_pending'
  });
  expect(window.__foliolePairSyncObserver.syncFailure).not.toContain('hidden');
});

it('keeps the native sync pack as intermediate evidence until product UI settlement', async () => {
  const source = read(observerPath);
  const window = { Capacitor: { nativePromise: async (_plugin, method) => (
    method === 'desktopHttpRequest' ? { status: 200 } : { deleted: true }
  ) }, crypto: { subtle: Object.create({ generateKey: async () => ({}) }) } };
  expect(JSON.parse(vm.runInNewContext(source, { Promise, URL, window }))).toEqual({ ok: true });
  const state = window.__foliolePairSyncObserver;
  state.completion = 'http_200'; state.credentials = 'saved_signable';
  await window.Capacitor.nativePromise('FolioleCompanionSync', 'desktopHttpRequest', {
    method: 'POST', url: 'http://127.0.0.1:38641/companion/sync-push'
  });
  expect(state.initialSync).toBe('started');
  await window.Capacitor.nativePromise('FolioleCompanionSyncPackTransfer', 'downloadDesktopSyncPack', {});
  expect(state.initialSync).toBe('started');
  await window.Capacitor.nativePromise('FolioleCompanionSyncPackTransfer', 'deleteDownloadedSyncPack', {});
  expect(state).toMatchObject({ initialSync: 'started', syncPackApplied: true, syncPackDownloaded: true });
  expect(state).not.toHaveProperty('groupActivation');
});

it('records the safe sync-pack URL and native failure detail', async () => {
  const source = read(observerPath);
  const window = { Capacitor: { nativePromise: async () => { throw new Error('Desktop binary resource returned 404.'); } },
    crypto: { subtle: Object.create({ generateKey: async () => ({}) }) } };
  expect(JSON.parse(vm.runInNewContext(source, { Promise, URL, window }))).toEqual({ ok: true });
  const state = window.__foliolePairSyncObserver;
  state.completion = 'http_200'; state.credentials = 'saved_signable';
  await expect(window.Capacitor.nativePromise('FolioleCompanionSyncPackTransfer',
    'downloadDesktopSyncPack', { url: 'http://127.0.0.1:38641/companion/sync-pack?after_state_seq=0' }))
    .rejects.toThrow('Desktop binary resource returned 404.');
  expect(state).toMatchObject({ initialSync: 'failed',
    syncFailure: 'Error: Desktop binary resource returned 404.',
    syncPackUrl: 'http://127.0.0.1:38641/companion/sync-pack?after_state_seq=0' });
});
