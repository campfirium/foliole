// @vitest-environment node

import { expect, it } from 'vitest';

import { proveA5SystemEntryDisplayNameConvergence } from './macos-a5-system-entry-sync-action.mjs';

it('renames, restores, and reopens the desktop product session in one bounded journey', async () => {
  const source = await import('node:fs').then(({ readFileSync }) =>
    readFileSync('scripts/android/macos-a5-system-entry-sync-action.mjs', 'utf8'));
  expect(source).toContain("session.invoke('save_system_entry_display_names', { payload: renamed })");
  expect(source).toContain("session.invoke('save_system_entry_display_names', { payload: baseline })");
  expect(source).toContain('waitForA5Payload(context, renamed)');
  expect(source).toContain('waitForA5Payload(context, baseline)');
  expect(source).toContain("inspectDisplay(context, 'renamed-display', { expectedText: ALIAS })");
  expect(source).toContain("inspectDisplay(context, 'restored-display', { forbiddenText: ALIAS })");
  expect(source.match(/openMacosPairSyncDesktopSession/gu)?.length).toBeGreaterThanOrEqual(3);
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
