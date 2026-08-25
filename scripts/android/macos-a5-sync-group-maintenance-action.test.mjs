/* global process */

import fs from 'node:fs';
import path from 'node:path';

import { afterEach, expect, it, vi } from 'vitest';

import { runMacosA5SyncGroupMaintenance } from '../sync-group/a5-sync-group-action.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((root) => fs.rmSync(root, { force: true, recursive: true })));

function createTestRoot() {
  const parent = path.join(process.cwd(), '.tmp', 'artifacts');
  fs.mkdirSync(parent, { recursive: true });
  return fs.mkdtempSync(path.join(parent, 'a5-maintenance-test-'));
}

it('uses the fixed product instrumentation method and records its receipt', async () => {
  const root = createTestRoot();
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
    observeWhileTransportOpen: vi.fn(async () => ({ exactFact: 'fact-a' })),
    paths: { adb: '/fixed/adb', apk: '/fixed/app.apk', buildRoot: process.cwd() }, serial: '87a33a4b'
  });
  expect(JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'))).toMatchObject({
    action: 'leave-sync-group', receipt: { departurePersisted: true }, serial: '87a33a4b'
  });
  expect(result.observation).toEqual({ exactFact: 'fact-a' });
  expect(execute.mock.calls.some(([, args]) => args.includes(
    'com.foliole.android.FolioleCompanionSyncGroupMaintenanceTest#leavesSyncGroupThroughProduct'
  ))).toBe(true);
  expect(execute.mock.calls.some(([, args]) => args.join(' ') ===
    '-s 87a33a4b reverse tcp:38641 tcp:38641')).toBe(true);
  const reverseCalls = execute.mock.calls.map(([, args]) => args.join(' '))
    .filter((args) => args.includes(' reverse '));
  expect(reverseCalls).toEqual([
    '-s 87a33a4b reverse --remove tcp:38641',
    '-s 87a33a4b reverse tcp:38641 tcp:38641',
    '-s 87a33a4b reverse --remove tcp:38641'
  ]);
  const commands = execute.mock.calls.map(([, args]) => args.join(' '));
  expect(commands.indexOf('-s 87a33a4b shell am force-stop com.foliole.android'))
    .toBeLessThan(commands.indexOf('-s 87a33a4b reverse tcp:38641 tcp:38641'));
  expect(execute.mock.calls.at(-1)?.[1]).toEqual([
    '-s', '87a33a4b', 'uninstall', 'com.foliole.android.test'
  ]);
});

it('maps the fixed device port to an explicit isolated macOS listener', async () => {
  const root = createTestRoot();
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
    paths: { adb: '/fixed/adb', apk: '/fixed/app.apk', buildRoot: process.cwd() }, serial: '87a33a4b'
  });
  expect(execute.mock.calls.some(([, args]) => args.join(' ') ===
    '-s 87a33a4b reverse tcp:38641 tcp:38642')).toBe(true);
});

it('accepts an already absent owned reverse listener before the single bind', async () => {
  const root = createTestRoot();
  roots.push(root);
  let removeCount = 0;
  const execute = vi.fn();
  execute.mockImplementation(async (_command, args) => {
    if (args.join(' ') === '-s 87a33a4b reverse --remove tcp:38641') {
      removeCount += 1;
      if (removeCount === 1) return { code: 1,
        output: "adb: error: listener 'tcp:38641' not found\n", stdout: '' };
    }
    if (args.includes('instrument')) return { code: 0, output: 'instrumentation', stdout: [
      'INSTRUMENTATION_STATUS: folioleActionReceipt={"syncRequested":true,"actionStarted":true,"actionRunId":"run-1","terminalRunId":"run-1","terminalResult":"completed"}',
      'INSTRUMENTATION_STATUS: folioleAfterSemantic={}', 'INSTRUMENTATION_CODE: -1'
    ].join('\n') };
    return { code: 0, output: 'Success\n', stdout: 'Success\n' };
  });
  await expect(runMacosA5SyncGroupMaintenance({
    action: 'sync-now', buildIdentity: 'absent-listener', env: {}, evidenceRoot: root, execute,
    observeWhileTransportOpen: async () => ({ exactFact: 'fact-a' }),
    paths: { adb: '/fixed/adb', apk: '/fixed/app.apk', buildRoot: process.cwd() }, serial: '87a33a4b'
  })).resolves.toMatchObject({ manifestPath: expect.any(String) });
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
  expect(scenario).toContain('item.optBoolean("disabled") != expectedEnabled');
});

it('binds ordinary sync to the visible public Sync Now product action', () => {
  const runner = fs.readFileSync('scripts/sync-group/a5-sync-group-action.mjs', 'utf8');
  const test = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSyncGroupMaintenanceTest.java',
    'utf8'
  );
  const scenario = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSyncGroupMaintenanceScenario.java',
    'utf8'
  );
  const action = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSyncNowAction.java',
    'utf8'
  );
  expect(runner).toContain("'sync-now': ['syncsNowThroughProduct', 'terminalRunId', true, false]");
  expect(test).toContain('syncsNowThroughProduct');
  const syncMethod = test.slice(test.indexOf('private void runSyncNow()'),
    test.indexOf('private static WebView readyWebView'));
  expect(syncMethod).toContain('activity::finish');
  expect(syncMethod).not.toContain('CountDownLatch');
  expect(scenario).toContain('FolioleCompanionSyncNowAction.perform');
  expect(action).toContain('!runId.equals(previousRunId)');
  expect(action).toContain('latest.optBoolean("started")');
  expect(action).toContain('runId.equals(latest.optString("terminalRunId"))');
  expect(action).toContain('put("actionStarted", true)');
  expect(action).toContain('put("syncRequested", true)');
  expect(action).toContain('put("terminalRunId", terminal.getString("terminalRunId"))');
  expect(action).toContain('put("errorText", terminal.optString("errorText"))');
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
  expect(scenario).toContain('"companion-sync-group-leave-error".equals(testId)');
  expect(scenario).toContain('"data-error-code"');
  expect(scenario).toContain('"Product Leave failed: "');
  expect(scenario).not.toContain('departureState(Context context)');
  expect(scenario).toContain('put("workgroupKeyRemoved", true)');
  expect(test).toContain('sendDepartureEvidence(instrumentation, receipt)');
  expect(test).toContain('put("bindingPresent", false)');
});

it('returns an abnormal instrumentation exit as raw controller failure', async () => {
  const root = createTestRoot();
  roots.push(root);
  const execute = vi.fn(async (_command, args) => args.includes('instrument') ? {
    code: 0,
    output: 'INSTRUMENTATION_RESULT: shortMsg=Process crashed.\nINSTRUMENTATION_CODE: 0',
    stdout: 'INSTRUMENTATION_RESULT: shortMsg=Process crashed.\nINSTRUMENTATION_CODE: 0'
  } : { code: 0, output: 'Success\n', stdout: 'Success\n' });
  await expect(runMacosA5SyncGroupMaintenance({
    action: 'leave-sync-group', buildIdentity: 'build-crashed', env: {}, evidenceRoot: root, execute,
    paths: { adb: '/fixed/adb', apk: '/fixed/app.apk', buildRoot: process.cwd() }, serial: '87a33a4b'
  })).rejects.toMatchObject({
    executionOwner: 'controller', failureAxis: 'execution', host: 'android-b',
    missingFact: 'android_instrumentation_terminal'
  });
});

it('preserves a lost Android window focus as an environment failure', async () => {
  const root = createTestRoot();
  roots.push(root);
  const execute = vi.fn(async (_command, args) => args.includes('instrument') ? {
    code: 0,
    output: 'java.lang.IllegalStateException: Foliole did not receive window focus;\nINSTRUMENTATION_CODE: -1',
    stdout: 'java.lang.IllegalStateException: Foliole did not receive window focus;\nINSTRUMENTATION_CODE: -1'
  } : { code: 0, output: 'Success\n', stdout: 'Success\n' });
  await expect(runMacosA5SyncGroupMaintenance({
    action: 'clear-app-data', buildIdentity: 'build-2', env: {}, evidenceRoot: root, execute,
    paths: { adb: '/fixed/adb', apk: '/fixed/app.apk', buildRoot: process.cwd() }, serial: '87a33a4b'
  })).rejects.toMatchObject({
    executionOwner: 'environment', failureAxis: 'execution', host: 'android-b',
    missingFact: 'android_instrumentation_terminal'
  });
});
