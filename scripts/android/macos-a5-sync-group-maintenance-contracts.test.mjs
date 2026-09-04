import fs from 'node:fs';

import { expect, it } from 'vitest';

it('creates journey facts only through the visible Capture product entry', async () => {
  const source = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSyncGroupMaintenanceScenario.java',
    'utf8'
  );
  expect(source).toContain('FolioleCompanionCaptureNavigation.enterBrowseSurface');
  expect(source).toContain('clickEnabled(instrumentation, webView, "companion-capture-save")');
  expect(source).toContain('"companion-capture-open"');
  expect(source).toContain('"companion-capture-text", "input", factText');
  expect(source).toContain('"companion-capture-save"');
  expect(source).toContain('put("factPersisted", true)');
  expect(source).toContain('put("factText", factText)');
  expect(source).not.toMatch(/SQLiteDatabase|rawQuery|SELECT /u);
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

it('observes journey convergence through a bounded visible product expectation', () => {
  const source = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleAcceptanceJourneyFactsTest.java',
    'utf8'
  );
  expect(source).toContain('FolioleCompanionCaptureNavigation.enterBrowseSurface');
  expect(source).toContain('expectedJourneyCounts');
  expect(source).toContain('journeyFactsObserved');
  expect(source).toContain('document.querySelectorAll');
  expect(source).not.toMatch(/SQLiteDatabase|rawQuery|SELECT /u);
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

it('opens Sync Group details before using the participation pause control', () => {
  const source = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSyncGroupMaintenanceScenario.java',
    'utf8'
  );
  const method = source.slice(source.indexOf('static JSONObject togglePause'),
    source.indexOf('static JSONObject syncNow'));
  expect(method.indexOf('"companion-sync-group-open"'))
    .toBeLessThan(method.indexOf('"companion-sync-pause-toggle"'));
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

it('rebuilds only the task-owned acceptance application from a fresh container', () => {
  const source = fs.readFileSync(
    'scripts/android/macos-a5-sync-group-maintenance-action.mjs', 'utf8'
  );
  expect(source).toContain('appId !== APP_ID');
  expect(source).toContain("['-s', serial, 'uninstall', appId]");
  expect(source).not.toMatch(/pm.*clear/u);
});
