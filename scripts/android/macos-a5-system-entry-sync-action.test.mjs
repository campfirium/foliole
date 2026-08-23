// @vitest-environment node

import { expect, it } from 'vitest';

import {
  proveA5SystemEntryDisplayNameConvergence,
  restartA5
} from './macos-a5-system-entry-sync-action.mjs';

it('cold-restarts A5 so foreground sync consumes the new desktop setting', async () => {
  const calls = [];
  await restartA5({
    env: {}, execute: async (_command, args) => {
      calls.push(args);
      return { code: 0 };
    }, paths: { adb: 'adb' }, serial: 'fixed-a5'
  });
  expect(calls).toEqual([
    ['-s', 'fixed-a5', 'shell', 'am', 'force-stop', 'com.foliole.android'],
    ['-s', 'fixed-a5', 'shell', 'am', 'start', '-W', '-n', 'com.foliole.android/.MainActivity']
  ]);
});

it('renames, restores, and reopens the desktop product session in one bounded journey', async () => {
  const source = await import('node:fs').then(({ readFileSync }) =>
    readFileSync('scripts/android/macos-a5-system-entry-sync-action.mjs', 'utf8'));
  const instrumentation = await import('node:fs').then(({ readFileSync }) => readFileSync(
    'android/app/src/androidTest/java/com/foliole/android/FolioleCompanionSystemEntryDisplayNameTest.java',
    'utf8'
  ));
  const inspection = await import('node:fs').then(({ readFileSync }) => readFileSync(
    'scripts/android/macos-a5-system-entry-display-inspection.mjs', 'utf8'
  ));
  expect(source).toContain("session.invoke('save_system_entry_display_names', { payload: renamed })");
  expect(source).toContain("inspectDisplay(context, 'baseline-display', {");
  expect(source).toContain('waitForA5Payload(context, baseline)');
  expect(source).toContain("session.invoke('save_system_entry_display_names', { payload: baseline })");
  expect(source).toContain('waitForA5Payload(context, renamed)');
  expect(source).toContain('waitForA5Payload(context, baseline)');
  expect(source).toContain("inspectDisplay(context, 'renamed-display', { expectedText: ALIAS })");
  expect(source).toContain("inspectDisplay(context, 'restored-display', { forbiddenText: ALIAS })");
  expect(source.match(/openMacosPairSyncDesktopSession/gu)?.length).toBeGreaterThanOrEqual(3);
  expect(source.indexOf("inspectDisplay(context, 'renamed-display'"))
    .toBeLessThan(source.indexOf('waitForA5Payload(context, renamed)'));
  expect(source.indexOf("inspectDisplay(context, 'restored-display'"))
    .toBeLessThan(source.lastIndexOf('waitForA5Payload(context, baseline)'));
  expect(instrumentation).toContain('requestProductSync(instrumentation, webView)');
  expect(instrumentation).toContain('FolioleCompanionSemanticActions.clickVisible(');
  expect(instrumentation).toContain('"companion-sync-now", deadline');
  expect(instrumentation).toContain('"companion-tab-shortcut"');
  expect(instrumentation).not.toContain('FolioleCompanionCaptureNavigation');
  expect(instrumentation).not.toContain('FolioleCompanionPairSyncRecoveryScenario');
  expect(instrumentation).toContain('awaitDisplayedInbox(');
  expect(instrumentation).toContain('arguments.getString("expectedTextBase64", "")');
  expect(inspection).toContain("'-e', 'expectedTextBase64'");
  expect(inspection).not.toContain("'-e', 'expectedText', expectedText");
  expect(inspection).toContain('if (expectedText) textExtras.push(');
  expect(inspection).toContain('if (forbiddenText) textExtras.push(');
  expect(inspection).toContain('INSTRUMENTATION_(?:RESULT: shortMsg|STATUS: stack|STATUS_CODE: -2)');
  expect(instrumentation.indexOf('requestProductSync(instrumentation, webView)'))
    .toBeLessThan(instrumentation.indexOf('"companion-tab-shortcut"'));
});

it('keeps the formal entry on the isolated controller library and protected backup path', async () => {
  const source = await import('node:fs').then(({ readFileSync }) =>
    readFileSync('scripts/android/macos-a5-system-entry-sync-action.mjs', 'utf8'));
  expect(source).toContain('libraryHome: context.paths.desktopDevLibrary');
  expect(source).toContain("args.protectData('backup'");
  expect(source).toContain("['-s', args.serial, 'install', '-r', args.paths.apk]");
  expect(source).not.toContain('/Users/roamer/Documents/Foliole');
  expect(typeof proveA5SystemEntryDisplayNameConvergence).toBe('function');
});
