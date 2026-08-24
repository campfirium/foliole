import fs from 'node:fs';

import { expect, it } from 'vitest';

import {
  finalizeSyncGroupApprovalEvidence,
  hasSyncGroupApprovalProviderReady,
  installedMainMatches,
  parseSyncGroupApprovalReceipt,
  runMacosA5SyncGroupApproval,
  startMacosA5SyncGroupApprovalProvider,
  stopMacosA5SyncGroupApprovalProvider
} from './macos-a5-sync-group-approval.mjs';

/* global process */

it('preserves provider failure details when approval instrumentation has no receipt', () => {
  const run = { code: 0, output: 'INSTRUMENTATION_CODE: -1\n', terminationReason: null };
  expect(() => finalizeSyncGroupApprovalEvidence({
    providerOutput: 'FolioleSyncProvider: Request failed: sync_group_data_payload_invalid\n', run
  })).toThrow(/sync_group_data_payload_invalid/u);
});

it('reuses an installed main APK only when its SHA-256 matches exactly', async () => {
  const execute = async (_command, args) => {
    if (args.includes('path')) return { code: 0, stdout: 'package:/data/app/foliole/base.apk\n' };
    return { code: 0, stdout: 'abc123  /data/app/foliole/base.apk\n' };
  };

  await expect(installedMainMatches({
    env: {}, execute, localHash: 'abc123', paths: { adb: 'adb', apk: '/repo/app.apk' }
  })).resolves.toBe(true);
  await expect(installedMainMatches({
    env: {}, execute, localHash: 'different', paths: { adb: 'adb', apk: '/repo/app.apk' }
  })).resolves.toBe(false);
});

it('keeps bounded instrumentation failure evidence', () => {
  const lines = Array.from({ length: 40 }, (_, index) => `line-${index + 1}`);
  expect(() => parseSyncGroupApprovalReceipt(lines.join('\n'))).toThrow(
    /line-17.*line-40/u
  );
});

it('accepts the complete approval receipt', () => {
  const receipt = {
    approved: true, foreground: true, ok: true, targetTestId: 'sync-group-approval'
  };
  expect(parseSyncGroupApprovalReceipt(
    `INSTRUMENTATION_STATUS: folioleSyncGroupApprovalReceipt=${JSON.stringify(receipt)}\nINSTRUMENTATION_CODE: -1`
  )).toEqual(receipt);
});

it('accepts a signed approval receipt after controller-owned sibling completion', () => {
  const receipt = {
    approved: true, foreground: true, ok: true, targetTestId: 'sync-group-approval'
  };
  expect(parseSyncGroupApprovalReceipt(
    `INSTRUMENTATION_STATUS: folioleSyncGroupApprovalReceipt=${JSON.stringify(receipt)}`, true
  )).toEqual(receipt);
});

it('recognizes only the action-local provider readiness status', () => {
  expect(hasSyncGroupApprovalProviderReady(
    'INSTRUMENTATION_STATUS: folioleSyncGroupApprovalReady=provider-listener-ready\n'
  )).toBe(true);
  expect(hasSyncGroupApprovalProviderReady(
    'INSTRUMENTATION_STATUS: folioleSyncGroupApprovalReady=provider-advertised\n'
  )).toBe(false);
  expect(hasSyncGroupApprovalProviderReady(
    'INSTRUMENTATION_STATUS: folioleSyncGroupApprovalReceipt={"ok":true}\n'
  )).toBe(false);
});

it('reuses bounded Settings navigation that exits Review and nested Settings surfaces', () => {
  const approval = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSyncGroupApprovalScenario.java',
    'utf8'
  );
  const navigation = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSettingsNavigation.java',
    'utf8'
  );
  expect(approval).toContain('FolioleCompanionSettingsNavigation.open(instrumentation, webView)');
  expect(navigation).toContain('"companion-top-bar-left-action"');
  expect(navigation).toContain('"companion-top-bar-back"');
  expect(navigation).toContain('"companion-tab-settings"');
  expect(navigation).toContain('"Timed out navigating to companion Settings; semantic="');
  expect(navigation).not.toContain('"companion-review-action-later"');
  expect(navigation).toContain('FolioleCompanionWebViewSemanticAdapter.perform');
  expect(navigation).toContain('"target_missing".equals(code) || "target_hidden".equals(code)');
  expect(navigation).not.toContain('clickVisible');
});

it('runs public Sync Now after approval in the ready instrumented runtime', () => {
  const approval = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSyncGroupApprovalScenario.java',
    'utf8'
  );
  const syncSettings = approval.indexOf('openSyncSettings(instrumentation, webView);');
  const providerReady = approval.indexOf('waitForInstrumentedRuntime(activity);');
  const peerRelease = approval.indexOf('onProviderReady.run();');
  const approvalClick = approval.indexOf(
    'FolioleCompanionSemanticActions.clickVisible(', peerRelease
  );
  const credential = approval.indexOf('waitForPeerCredential(');
  const syncNow = approval.indexOf('FolioleCompanionSyncGroupMaintenanceScenario.syncNow(');
  expect(syncSettings).toBeGreaterThan(0);
  expect(providerReady).toBeGreaterThan(syncSettings);
  expect(peerRelease).toBeGreaterThan(providerReady);
  expect(approvalClick).toBeGreaterThan(peerRelease);
  expect(credential).toBeGreaterThan(approvalClick);
  expect(syncNow).toBeGreaterThan(credential);
  expect(approval).toContain('TimeUnit.SECONDS.toNanos(60)');
  expect(approval).toContain('"registered".equals(state) && listenerReady(activity)');
  expect(approval).toContain('.isServiceMonitorReady()');
  expect(approval).not.toContain('FolioleCompanionSyncGroupProvider.start(');
  const plugin = fs.readFileSync(
    'android/app/src/main/java/com/foliole/android/FolioleCompanionSyncPlugin.java', 'utf8'
  );
  expect(plugin).toContain('return hasListeners(name);');
  expect(plugin).toContain('notifyListeners(name, event, true)');
});

it('tracks the approved peer by the current join authorization identity', () => {
  const approval = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSyncGroupApprovalScenario.java',
    'utf8'
  );
  expect(approval).toContain('pendingJoiningAuthorizationId()');
  expect(approval).toContain('getString("pair_request_id")');
  expect(approval).not.toContain('getString("device_id")');
});

it('opens transport after provider stop and starts the peer only after the product surface is stable', async () => {
  const order = [];
  const execute = async (_command, args) => {
    order.push(args.some((arg) => arg.endsWith('verify-android-launch.mjs')) ? 'stable' : 'started');
    return { code: 0, output: '' };
  };
  await startMacosA5SyncGroupApprovalProvider({
    env: {}, execute, onProviderStopped: async () => { order.push('transport'); },
    onReady: async () => { order.push('peer'); },
    paths: { adb: 'adb', buildRoot: '/repo' }
  });
  expect(order).toEqual(['transport', 'started', 'stable', 'peer']);
});

it('ends the previous provider lifecycle before a staged foreground restart', async () => {
  const calls = [];
  await stopMacosA5SyncGroupApprovalProvider({
    env: {}, execute: async (command, args, options) => {
      calls.push({ args, command, options });
      return { code: 0, output: '' };
    }, paths: { adb: 'adb' }
  });
  expect(calls).toEqual([{
    args: ['-s', '87a33a4b', 'shell', 'am', 'force-stop', 'com.foliole.android'],
    command: 'adb', options: { env: {}, timeoutMs: 30_000 }
  }]);
});

it('starts the peer from instrumented readiness and restores after instrumentation removal', async () => {
  const events = [];
  const receipt = { approved: true, foreground: true, ok: true,
    targetTestId: 'sync-group-approval' };
  const execute = async (_command, args) => {
    if (args.includes('uninstall')) events.push('test-uninstalled');
    else if (args.includes('kill-server')) events.push('adb-stopped');
    else if (args.includes('force-stop')) events.push('provider-stopped');
    return { code: 0, output: '' };
  };
  await runMacosA5SyncGroupApproval({ assertFixed: () => {}, execute,
  instrumentationExecute: async (_command, _args, options) => {
    events.push('instrumentation-started');
    options.onOutput({ output:
      'INSTRUMENTATION_STATUS: folioleSyncGroupApprovalReady=provider-listener-ready\n' });
    return { code: 0,
      output: `INSTRUMENTATION_STATUS: folioleSyncGroupApprovalReceipt=${JSON.stringify(receipt)}\nINSTRUMENTATION_CODE: -1` };
  }, mainMatches: async () => true, onProviderStopped: async () => events.push('transport-open'),
  onReady: async () => events.push('peer-started'), prepare: () => {}, repoRoot: process.cwd(),
  startProvider: async ({ onProviderStopped }) => {
    await onProviderStopped(); events.push('provider-started');
  } });
  expect(events).toEqual([
    'provider-stopped', 'transport-open', 'instrumentation-started', 'peer-started',
    'test-uninstalled', 'adb-stopped',
    'provider-stopped', 'provider-started'
  ]);
});
