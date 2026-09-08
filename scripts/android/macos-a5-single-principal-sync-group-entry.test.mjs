import fs from 'node:fs';

import { expect, it } from 'vitest';

import { inspectExpectedJourneyFacts } from './macos-a5-single-principal-sync-group-facts.mjs';
import {
  removeA5AcceptanceApplication
} from './macos-a5-acceptance-package-cleanup.mjs';

it('accepts a nonzero MIUI uninstall result only after the package is absent', async () => {
  const options = [];
  const calls = [];
  const execute = async (_command, args, executionOptions) => {
    calls.push(args);
    options.push(executionOptions);
    return args[2] === 'uninstall'
    ? { code: 1, output: 'Failure [DELETE_FAILED_INTERNAL_ERROR]' }
    : { code: 0, output: '' };
  };
  await expect(removeA5AcceptanceApplication({ execute, paths: { adb: 'adb' }, serial: 'a5' }))
    .resolves.toBeUndefined();
  expect(options).toHaveLength(8);
  expect(options).toEqual(expect.arrayContaining([
    expect.objectContaining({ timeoutCode: 'a5_acceptance_cleanup_timeout', timeoutMs: 60_000 })
  ]));
  expect(calls[0]).toEqual(['-s', 'a5', 'shell', 'am', 'force-stop',
    'com.foliole.android.acceptance.test']);
});

it('rejects a failed uninstall while the acceptance package remains installed', async () => {
  const execute = async (_command, args) => args.includes('uninstall')
    ? { code: 1, output: 'Failure [DELETE_FAILED_INTERNAL_ERROR]' }
    : { code: 0, output: 'package:/data/app/base.apk' };
  await expect(removeA5AcceptanceApplication({ execute, paths: { adb: 'adb' }, serial: 'a5' }))
    .rejects.toThrow('cleanup failed');
});

it('uses the user package manager when MIUI rejects the ordinary uninstall', async () => {
  const calls = [];
  const execute = async (_command, args) => {
    calls.push(args);
    if (args[2] === 'uninstall') return { code: 1, output: 'Failure [DELETE_FAILED_INTERNAL_ERROR]' };
    if (args.includes('--user') && args.includes('uninstall')) return { code: 0, output: 'Success' };
    return { code: 0, output: '' };
  };
  await removeA5AcceptanceApplication({ execute, paths: { adb: 'adb' }, serial: 'a5' });
  expect(calls.at(-1)).toEqual(['-s', 'a5', 'shell', 'pm', 'uninstall', '--user', '0',
    'com.foliole.android.acceptance']);
});

it('materializes both isolated Android and hidden Mac runtimes inside the frozen capsule', () => {
  const source = fs.readFileSync(
    'scripts/android/macos-a5-single-principal-sync-group-entry.mjs', 'utf8'
  );
  const cleanup = fs.readFileSync(
    'scripts/android/macos-a5-acceptance-package-cleanup.mjs', 'utf8'
  );
  const buildSource = fs.readFileSync('scripts/android/a5-two-device-build.mjs', 'utf8');
  const joinEvidence = fs.readFileSync('scripts/android/a5-two-device-join-evidence.mjs', 'utf8');
  expect(source).toContain('buildA5TwoDeviceAcceptance(args)');
  expect(buildSource).toContain("FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID: ACCEPTANCE_APP_ID");
  expect(buildSource).toContain('macosAcceptanceEnv(args.env)');
  expect(source).toContain('assertMacosAcceptanceSyncGroupServer(await session.enable())');
  expect(buildSource).toContain("'--no-daemon', 'assembleDebug', 'assembleDebugAndroidTest'");
  expect(buildSource).toContain("['run', 'build']");
  expect(buildSource).toContain("['run', 'electron:compile']");
  expect(source).toContain('openMacosSyncGroupDesktopSession');
  expect(source).toContain('observeConcurrently: true');
  expect(source).toContain('observeAndAccept(session, options)');
  expect(source).not.toContain('waitForCurrentA5Provider');
  expect(source).not.toContain('macos-a5-current-provider-readiness');
  expect(source).toContain("eventName: 'onWorkspaceSyncApplied'");
  expect(source).toContain('FOLIOLE_T152_ACCEPTANCE_ROOT');
  expect(source).toContain("FOLIOLE_T152_SYNC_CREATOR === 'windows'");
  expect(source).toContain("action: 'activate-participation'");
  expect(source).toContain("action: 'create-journey-fact'");
  expect(source).toContain('observeA5JourneyFacts(args, buildIdentity, env');
  expect(source).toContain('createDesktopSyncGroupJourneyFact');
  expect(source).toContain("'desktop-initial-fact'");
  expect(source).toContain("'initial-union'");
  expect(source).toContain("'desktop-manual-fact'");
  expect(source).toContain("action: 'sync-now'");
  expect(source).not.toMatch(/collectAndroidDeviceSnapshot|databaseInspector|tables: \['nodes'/u);
  expect(joinEvidence).toContain('productError');
  expect(joinEvidence).toContain("'join-failure-screen.png'");
  expect(joinEvidence).toContain("'screencap', '-p', remotePath");
  expect(source).toContain("'keyevent', 'KEYCODE_WAKEUP'");
  expect(source).toContain("'wm', 'dismiss-keyguard'");
  expect(source).toContain('`${ACCEPTANCE_APP_ID}/${PRODUCT_APP_ID}.MainActivity`');
  expect(source).not.toContain('`${ACCEPTANCE_APP_ID}/.MainActivity`');
  expect(source).not.toContain("if (suffix === 'initial-manual')");
  expect(cleanup).toContain('`${ACCEPTANCE_APP_ID}.test`');
  expect(cleanup).toContain("'uninstall', packageId");
  expect(source.match(/await removeA5AcceptanceApplication\(args\)/gu)).toHaveLength(2);
  expect(source).not.toContain("protectData('backup'");
  expect(source).not.toContain('deviceBackupRoot');
});

it('creates the fixed A5 nonempty fact before requesting either desktop-created group', () => {
  const source = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSyncGroupJoinScenario.java',
    'utf8'
  );
  expect(source.indexOf('FolioleCompanionSyncGroupMaintenanceScenario.createFact'))
    .toBeLessThan(source.indexOf('companion-sync-discover'));
  expect(source).toContain('prejoinFactText');
  const reverse = fs.readFileSync('scripts/android/macos-a5-windows-two-device-entry.mjs', 'utf8');
  expect(reverse).toContain("action: 'observe-journey-facts'");
  expect(reverse).toContain("{ A: 2, B: 2 }");
  expect(reverse).toContain("action: 'sync-now'");
  expect(reverse).not.toMatch(/collectAndroidDeviceSnapshot|waitForCounts|database/u);
  expect(reverse).not.toMatch(/pm.*clear|DELETE FROM|UPDATE sync_/u);
  expect(reverse).not.toContain("protectData('backup'");
});

it('can join an already-running external group without coupling join to a journey fact', () => {
  const source = fs.readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSyncGroupJoinScenario.java',
    'utf8'
  );
  expect(source).toContain('getString("joinOnly", "false")');
  expect(source).toContain('if (!joinOnly)');
  expect(source.indexOf('if (!joinOnly)')).toBeLessThan(source.indexOf('companion-sync-discover'));
  expect(source).toContain('getString("expectedEndpoint", "")');
  expect(source).toContain('assertEndpointIdentity(context, preferredEndpoint, groupId, groupTag)');
  expect(source).toContain('acceptance_group_endpoint_identity_mismatch');
  expect(source).toContain('"data-sync-group-id"');
  expect(source).not.toContain('"data-sync-endpoint"');
});

it('binds A5 convergence to only the exact facts created by the current attempt', () => {
  const database = { prepare: () => ({ all: (...ids) => ids
    .filter((id) => id !== 'missing').map((id) => ({ id })) }) };
  expect(inspectExpectedJourneyFacts(database, [
    { factId: 'desktop-initial', origin: 'A' },
    { factId: 'android', origin: 'B' },
    { factId: 'missing', origin: 'A' }
  ])).toEqual({
    foundIds: ['desktop-initial', 'android'], missingIds: ['missing'], origins: ['A', 'B']
  });
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
  expect(source).toContain('expectedGroupId');
  expect(source).toContain('expectedGroupTag');
  expect(source).toContain('acceptance_group_identity_not_unique');
  expect(source).toContain('acceptance_group_identity_not_found');
  expect(source).toContain('while (System.nanoTime() < deadline)');
  expect(source).toContain('Thread.sleep(500)');
  expect(source).toContain('stage=provider-unreachable');
  expect(source).not.toContain('matches.size() != 1');
  expect(source).toContain('clickUniqueVisibleMatchingAttribute');
  expect(source).toContain('stage=discovery-requested');
  expect(source).toContain('stage=device-visible');
  expect(source).toContain('stage=device-requested');
  expect(source).toContain('stage=awaiting-approval');
  expect(source).toContain('stage=initial-sync-completed');
  expect(source).toContain('FolioleCompanionSyncNowAction.waitUntilEnabled');
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
  expect(source).toContain('!"target_missing".equals(receipt.optString("code"))');
});
