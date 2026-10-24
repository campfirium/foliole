// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { assertRegisteredMacosA5Action } from './macos-a5-action-registry.mjs';
import { A5_DAILY_APP_ID, A5_TEST_APP_ID, resolveMacosA5Identity } from './macos-a5-app-identity.mjs';

const session = vi.hoisted(() => ({ run: null }));
vi.mock('../capacitor/companion-live-session.mjs', async (original) => ({
  ...await original(),
  runCompanionLiveSession: async (options) => {
    session.run = options;
    await options.start();
    await options.restore();
  }
}));

const { runMacosA5Live } = await import('./macos-a5-live.mjs');

function harness(installedId) {
  const calls = [];
  const paths = { adb: 'adb', apk: '/apk', buildRoot: '/repo', cap: 'cap', gradle: 'gradlew' };
  return {
    calls,
    args: {
      assertFixed: () => calls.push(['assert-fixed']),
      captured: () => installedId,
      checked: (command, args, options = {}) => calls.push([command, ...args, options.env?.FOLIOLE_DEV_LIVE_RELOAD ?? '-']),
      env: { ANDROID_SDK_ROOT: '/sdk' },
      paths,
      serial: 'serial'
    }
  };
}

describe('A5 live reload', () => {
  it('is a device action that only ever targets the A5 test application', () => {
    expect(assertRegisteredMacosA5Action('live')).toMatchObject({ deviceLeaseMode: 'mutation', mutatesFixedA5: true });
    expect(resolveMacosA5Identity('live', undefined)).toBe('test');
  });

  it('refuses to install a live shell built for the daily application', async () => {
    const { args, calls } = harness(A5_DAILY_APP_ID);

    await expect(runMacosA5Live(args)).rejects.toThrow('only installs the A5 test application');
    expect(calls.some(([command, action]) => command === 'adb' && action === '-s')).toBe(false);
  });

  it('installs the live test shell, serves it through adb reverse, then returns the project to the bundled config', async () => {
    const { args, calls } = harness(A5_TEST_APP_ID);

    await runMacosA5Live(args);

    expect(calls).toEqual([
      ['assert-fixed'],
      ['npm', 'run', 'android:web:build', '-'],
      ['cap', 'sync', 'android', '1'],
      ['gradlew', '--no-daemon', '--build-cache', 'assembleDebug', '1'],
      ['adb', '-s', 'serial', 'install', '-r', '/apk', '-'],
      ['adb', '-s', 'serial', 'reverse', 'tcp:24605', 'tcp:24605', '-'],
      ['adb', '-s', 'serial', 'shell', 'am', 'force-stop', A5_TEST_APP_ID, '-'],
      ['adb', '-s', 'serial', 'shell', 'am', 'start', '-n', `${A5_TEST_APP_ID}/com.foliole.android.MainActivity`, '-'],
      ['adb', '-s', 'serial', 'reverse', '--remove', 'tcp:24605', '-'],
      ['cap', 'sync', 'android', '-']
    ]);
  });
});
