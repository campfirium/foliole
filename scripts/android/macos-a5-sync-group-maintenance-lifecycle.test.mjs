/* global process */

import fs from 'node:fs';
import path from 'node:path';

import { expect, it, vi } from 'vitest';

import { runMacosA5InstrumentationMechanics } from './macos-a5-sync-group-maintenance-action.mjs';

it('cleans up instrumentation before restarting the real Activity', async () => {
  const evidenceRoot = fs.mkdtempSync(path.join(
    process.cwd(), '.tmp/artifacts/a5-maintenance-lifecycle-'
  ));
  const execute = vi.fn(async (_command, args) => args.includes('instrument') ? {
    code: 0, output: 'instrumentation',
    stdout: 'INSTRUMENTATION_CODE: -1'
  } : args.includes('dumpsys') ? {
    code: 0,
    output: 'topResumedActivity=com.foliole.android.acceptance/com.foliole.android.MainActivity',
    stdout: 'topResumedActivity=com.foliole.android.acceptance/com.foliole.android.MainActivity'
  } : { code: 0, output: 'Success\n', stdout: 'Success\n' });
  try {
    await runMacosA5InstrumentationMechanics({
      appId: 'com.foliole.android.acceptance', buildIdentity: 'build-1', env: {},
      evidenceRoot, execute, installMain: false,
      paths: { adb: '/fixed/adb', apk: '/fixed/app.apk', buildRoot: process.cwd() },
      restartApp: true, serial: '87a33a4b',
      testClass: 'com.foliole.android.FolioleCompanionSyncGroupMaintenanceTest'
    });
    const commands = execute.mock.calls.map(([, args]) => args.join(' '));
    expect(commands).toContain('-s 87a33a4b shell input keyevent KEYCODE_BACK');
    expect(commands).toContain(
      '-s 87a33a4b shell dumpsys activity activities'
    );
    expect(commands.indexOf(
      '-s 87a33a4b shell am start -W -n com.foliole.android.acceptance/com.foliole.android.MainActivity'
    )).toBeLessThan(commands.findIndex((command) => command.includes(' am instrument ')));
    expect(commands.indexOf('-s 87a33a4b uninstall com.foliole.android.acceptance.test'))
      .toBeLessThan(commands.lastIndexOf(
        '-s 87a33a4b shell am start -W -n com.foliole.android.acceptance/com.foliole.android.MainActivity'
      ));
  } finally { fs.rmSync(evidenceRoot, { force: true, recursive: true }); }
});
