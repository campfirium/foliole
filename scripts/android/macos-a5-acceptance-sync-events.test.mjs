// @vitest-environment node

import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { assertRegisteredMacosA5Action } from './macos-a5-action-registry.mjs';
import { removeA5AcceptanceTestApplication } from './macos-a5-acceptance-package-cleanup.mjs';
import { readA5AcceptanceSyncEvents } from './macos-a5-acceptance-sync-events.mjs';

function args() {
  return {
    assertFixed: vi.fn(), buildIdentity: () => 'read-1',
    checked: vi.fn(), env: {}, execute: vi.fn(),
    paths: { adb: '/fixed/adb', artifactsRoot: '/artifacts',
      buildRoot: '/repo', gradle: '/repo/android/gradlew' }, serial: '87a33a4b'
  };
}

it('registers an acceptance-only observation without product data mutation', () => {
  expect(assertRegisteredMacosA5Action('acceptance-sync-events')).toMatchObject({
    deviceLeaseMode: 'mutation', formalSourceClass: 'ordinary-only',
    mutatesFixedA5: false, requiresHiddenDesktopRuntime: false
  });
});

it('reads only the acceptance package and restores the main foreground', async () => {
  const input = args();
  const runAction = vi.fn(async () => ({ manifestPath: '/artifacts/read-1/manifest.json' }));
  await readA5AcceptanceSyncEvents(input, runAction);
  expect(input.assertFixed).toHaveBeenCalledOnce();
  expect(input.checked).toHaveBeenCalledWith('/repo/android/gradlew',
    ['--no-daemon', 'assembleDebugAndroidTest'], expect.objectContaining({
      cwd: path.join(input.paths.buildRoot, 'android'), env: expect.objectContaining({
        FOLIOLE_ANDROID_ACCEPTANCE_APPLICATION_ID: 'com.foliole.android.acceptance'
      })
    }));
  expect(runAction).toHaveBeenCalledWith(expect.objectContaining({
    action: 'read-sync-events', appId: 'com.foliole.android.acceptance',
    installMain: false, serial: '87a33a4b'
  }));
  expect(input.checked).toHaveBeenCalledWith('/fixed/adb', [
    '-s', '87a33a4b', 'shell', 'am', 'start', '-W', '-n',
    'com.foliole.android/com.foliole.android.MainActivity'
  ]);
});

it('restores the main foreground after a projection failure', async () => {
  const input = args();
  await expect(readA5AcceptanceSyncEvents(input, async () => {
    throw new Error('projection failed');
  })).rejects.toThrow('projection failed');
  expect(input.checked).toHaveBeenCalledTimes(2);
});

it('cleans only the acceptance test package through the MIUI fallback', async () => {
  const calls = [];
  const execute = vi.fn(async (_command, arguments_) => {
    calls.push(arguments_);
    if (arguments_[2] === 'uninstall') return {
      code: 1, output: 'Failure [DELETE_FAILED_INTERNAL_ERROR]'
    };
    return { code: 0, output: 'Success' };
  });
  await removeA5AcceptanceTestApplication({ execute, paths: { adb: '/fixed/adb' },
    serial: '87a33a4b' }, {});
  expect(calls.at(-1)).toEqual(['-s', '87a33a4b', 'shell', 'pm', 'uninstall',
    '--user', '0', 'com.foliole.android.acceptance.test']);
  expect(calls.flat()).not.toContain('com.foliole.android.acceptance');
});
