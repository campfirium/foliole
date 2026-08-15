/* global process */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { runMacosA5SyncGroupMaintenance } from './macos-a5-sync-group-maintenance-action.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

it('uses the fixed product instrumentation method and records its receipt', async () => {
  const root = fs.mkdtempSync(path.join(process.cwd(), '.tmp/artifacts/a5-maintenance-test-'));
  roots.push(root);
  const execute = vi.fn(async (_command, args) => {
    if (args.includes('instrument')) return {
      code: 0,
      output: 'instrumentation',
      stdout: [
        'INSTRUMENTATION_STATUS: folioleActionReceipt={"ok":true,"departurePersisted":true}',
        'INSTRUMENTATION_STATUS: folioleAfterSemantic={"location":"/"}',
        'INSTRUMENTATION_CODE: -1'
      ].join('\n')
    };
    return { code: 0, output: 'Success\n', stdout: 'Success\n' };
  });
  const result = await runMacosA5SyncGroupMaintenance({
    action: 'leave-sync-group', buildIdentity: 'build-1', env: {}, evidenceRoot: root, execute,
    paths: { adb: '/fixed/adb', apk: '/fixed/app.apk', repoRoot: process.cwd() }, serial: '87a33a4b'
  });
  expect(JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'))).toMatchObject({
    action: 'leave-sync-group', receipt: { departurePersisted: true }, serial: '87a33a4b'
  });
  expect(execute.mock.calls.some(([, args]) => args.includes(
    'com.foliole.android.FolioleCompanionSyncGroupMaintenanceTest#leavesSyncGroupThroughProduct'
  ))).toBe(true);
  expect(execute.mock.calls.some(([, args]) => args.join(' ') ===
    '-s 87a33a4b reverse tcp:38641 tcp:38641')).toBe(true);
  expect(execute.mock.calls.some(([, args]) => args.join(' ') ===
    '-s 87a33a4b reverse --remove tcp:38641')).toBe(true);
  expect(execute.mock.calls.at(-1)?.[1]).toEqual([
    '-s', '87a33a4b', 'uninstall', 'com.foliole.android.test'
  ]);
});

it('maps the fixed device port to an explicit isolated macOS listener', async () => {
  const root = fs.mkdtempSync(path.join(process.cwd(), '.tmp/artifacts/a5-maintenance-test-'));
  roots.push(root);
  const execute = vi.fn(async (_command, args) => args.includes('instrument') ? {
    code: 0,
    output: 'instrumentation',
    stdout: [
      'INSTRUMENTATION_STATUS: folioleActionReceipt={"departurePersisted":true}',
      'INSTRUMENTATION_STATUS: folioleAfterSemantic={}',
      'INSTRUMENTATION_CODE: -1'
    ].join('\n')
  } : { code: 0, output: 'Success\n', stdout: 'Success\n' });
  await runMacosA5SyncGroupMaintenance({
    action: 'leave-sync-group', buildIdentity: 'isolated',
    env: { FOLIOLE_COMPANION_SYNC_PORT: '38642' }, evidenceRoot: root, execute,
    paths: { adb: '/fixed/adb', apk: '/fixed/app.apk', repoRoot: process.cwd() }, serial: '87a33a4b'
  });
  expect(execute.mock.calls.some(([, args]) => args.join(' ') ===
    '-s 87a33a4b reverse tcp:38641 tcp:38642')).toBe(true);
});

it('creates journey facts only through the visible Capture product entry', async () => {
  const source = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSyncGroupMaintenanceScenario.java',
    'utf8'
  );
  expect(source).toContain('FolioleCompanionCaptureNavigation.enterBrowseSurface');
  expect(source).toContain('"companion-capture-open"');
  expect(source).toContain('"companion-capture-text", "input", factText');
  expect(source).toContain('"companion-capture-save"');
  expect(source).toContain('put("factPersisted", true)');
  expect(source).toContain('put("factId", factId)');
  expect(source).toContain('SQLiteDatabase.OPEN_READONLY');
  const capture = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionCaptureAnnotationScenario.java',
    'utf8'
  );
  const adapter = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionWebViewSemanticAdapter.java',
    'utf8'
  );
  expect(capture).toContain('FolioleCompanionWebViewSemanticAdapter.tryEvaluateBoolean');
  expect(adapter).toContain('catch (WebViewEvaluationTimeoutException timeout)');
});

it('activates persisted Sync participation through visible product controls', async () => {
  const source = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSyncGroupMaintenanceTest.java',
    'utf8'
  );
  expect(source).toContain('activatesSyncParticipationThroughProduct');
  expect(source).toContain('FolioleCompanionSyncGroupMaintenanceScenario.toggleSync');
  expect(source).toContain('FolioleCompanionSyncGroupMaintenanceScenario.togglePause');
  expect(source).toContain('waitParticipation(instrumentation, true, false)');
  expect(source).toContain('put("activated", true)');
  const scenario = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSyncGroupMaintenanceScenario.java',
    'utf8'
  );
  expect(scenario).toContain('clickEnabled(instrumentation, webView, "companion-sync-toggle")');
  expect(scenario).toContain('!item.optBoolean("disabled")');
});

it('observes Leave through durable host state after the visible confirmation', () => {
  const test = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSyncGroupMaintenanceTest.java',
    'utf8'
  );
  const scenario = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSyncGroupMaintenanceScenario.java',
    'utf8'
  );
  expect(scenario).toContain('click(instrumentation, webView, "companion-sync-group-open")');
  expect(scenario).toContain('"companion-sync-group-leave-confirm"');
  expect(scenario).toContain('waitUntilMissing(instrumentation, webView, "companion-sync-group-leave-confirm"');
  expect(scenario).not.toContain('departureState(Context context)');
  expect(scenario).toContain('put("workgroupKeyRemoved", true)');
  expect(test).toContain('sendDepartureEvidence(instrumentation, receipt)');
  expect(test).toContain('put("bindingPresent", false)');
});

it('classifies an abnormal instrumentation exit as an Android product failure', async () => {
  const root = fs.mkdtempSync(path.join(process.cwd(), '.tmp/artifacts/a5-maintenance-test-'));
  roots.push(root);
  const execute = vi.fn(async (_command, args) => args.includes('instrument') ? {
    code: 0,
    output: 'INSTRUMENTATION_RESULT: shortMsg=Process crashed.\nINSTRUMENTATION_CODE: 0',
    stdout: 'INSTRUMENTATION_RESULT: shortMsg=Process crashed.\nINSTRUMENTATION_CODE: 0'
  } : { code: 0, output: 'Success\n', stdout: 'Success\n' });
  await expect(runMacosA5SyncGroupMaintenance({
    action: 'leave-sync-group', buildIdentity: 'build-crashed', env: {}, evidenceRoot: root, execute,
    paths: { adb: '/fixed/adb', apk: '/fixed/app.apk', repoRoot: process.cwd() }, serial: '87a33a4b'
  })).rejects.toMatchObject({
    failureOwner: 'product', host: 'android-b', missingFact: 'product_instrumentation_failed'
  });
});

it('preserves a lost Android window focus as an environment failure', async () => {
  const root = fs.mkdtempSync(path.join(process.cwd(), '.tmp/artifacts/a5-maintenance-test-'));
  roots.push(root);
  const execute = vi.fn(async (_command, args) => args.includes('instrument') ? {
    code: 0,
    output: 'java.lang.IllegalStateException: Foliole did not receive window focus;\nINSTRUMENTATION_CODE: -1',
    stdout: 'java.lang.IllegalStateException: Foliole did not receive window focus;\nINSTRUMENTATION_CODE: -1'
  } : { code: 0, output: 'Success\n', stdout: 'Success\n' });
  await expect(runMacosA5SyncGroupMaintenance({
    action: 'clear-app-data', buildIdentity: 'build-2', env: {}, evidenceRoot: root, execute,
    paths: { adb: '/fixed/adb', apk: '/fixed/app.apk', repoRoot: process.cwd() }, serial: '87a33a4b'
  })).rejects.toMatchObject({
    failureOwner: 'environment', host: 'android-b',
    lastSuccessfulAction: 'android_activity_started',
    missingFact: 'android_app_window_focus_missing'
  });
});
