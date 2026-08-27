import fs from 'node:fs';

import { expect, it } from 'vitest';

it('materializes both isolated Android and hidden Mac runtimes inside the frozen capsule', () => {
  const source = fs.readFileSync(
    'scripts/android/macos-a5-single-principal-sync-group-entry.mjs', 'utf8'
  );
  expect(source).toContain("FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID: ACCEPTANCE_APP_ID");
  expect(source).toContain('macosAcceptanceEnv(args.env)');
  expect(source).toContain('assertMacosAcceptanceSyncGroupServer(await session.enable())');
  expect(source).toContain("'--no-daemon', 'assembleDebug', 'assembleDebugAndroidTest'");
  expect(source).toContain("['run', 'build']");
  expect(source).toContain("['run', 'electron:compile']");
  expect(source).toContain('openMacosSyncGroupDesktopSession');
  expect(source).toContain('observeConcurrently: true');
  expect(source).toContain('observeAndAccept(session, options)');
  expect(source).toContain('waitForCurrentA5Provider');
  expect(source).toContain('deviceId: result.observation.deviceId');
  expect(source).toContain("'provider-failure-logcat.txt'");
  expect(source).toContain("'logcat', '-d', '--pid', pid");
  expect(source).toContain('FOLIOLE_T152_ACCEPTANCE_ROOT');
  expect(source).toContain("action: 'activate-participation'");
  expect(source).toContain("action: 'create-journey-fact'");
  expect(source).toContain("action: 'sync-now'");
  expect(source).toContain("['A', 'B', 'C'].every");
  expect(source).toContain('productError');
  expect(source).toContain("'join-failure-screen.png'");
  expect(source).toContain("'screencap', '-p', remotePath");
  expect(source).toContain("'keyevent', 'KEYCODE_WAKEUP'");
  expect(source).toContain("'wm', 'dismiss-keyguard'");
  expect(source).toContain('`${ACCEPTANCE_APP_ID}/${PRODUCT_APP_ID}.MainActivity`');
  expect(source).not.toContain('`${ACCEPTANCE_APP_ID}/.MainActivity`');
  expect(source).not.toContain("if (suffix === 'initial-manual')");
  expect(source).toContain("'uninstall', ACCEPTANCE_APP_ID");
});

it('short-circuits the physical A5 journey with named product stages', () => {
  const source = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSyncGroupJoinScenario.java',
    'utf8'
  );
  expect(source).toContain('STAGE_TIMEOUT_SECONDS = 30');
  expect(source).toContain('long stageDeadline()');
  expect(source).not.toContain('long requestDeadline');
  expect(source).not.toContain('"companion-sync-now", deadline');
  expect(source.match(/stageDeadline\(\)/gu)).toHaveLength(9);
  expect(source).toContain('stage=settings-open');
  expect(source).toContain('"companion-sync-discover"');
  expect(source).toContain('stage=discovery-requested');
  expect(source).toContain('stage=device-visible');
  expect(source).toContain('stage=device-requested');
  expect(source).toContain('stage=awaiting-approval');
});

it('enters Browse through the visible bottom tab from Settings', () => {
  const source = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionCaptureNavigation.java',
    'utf8'
  );
  expect(source).toContain('BROWSE_TAB = "companion-tab-browse"');
  expect(source).toContain('waitForBrowseEntry(instrumentation, webView, timeoutMs)');
  expect(source).toContain('if (hasTestId(instrumentation, webView, BROWSE_TAB)) return BROWSE_TAB;');
  expect(source).toContain(
    'if (hasTestId(instrumentation, webView, TOP_BAR_LEFT_ACTION)) return TOP_BAR_LEFT_ACTION;'
  );
});
