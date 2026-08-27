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
  } : { code: 0, output: 'Success\n', stdout: 'Success\n' });
  try {
    await runMacosA5InstrumentationMechanics({
      buildIdentity: 'build-1', env: {}, evidenceRoot, execute, installMain: false,
      paths: { adb: '/fixed/adb', apk: '/fixed/app.apk', buildRoot: process.cwd() },
      restartApp: true, serial: '87a33a4b',
      testClass: 'com.foliole.android.FolioleCompanionSyncGroupMaintenanceTest'
    });
    const commands = execute.mock.calls.map(([, args]) => args.join(' '));
    expect(commands.indexOf('-s 87a33a4b uninstall com.foliole.android.test'))
      .toBeLessThan(commands.indexOf(
        '-s 87a33a4b shell am start -W -n com.foliole.android/com.foliole.android.MainActivity'
      ));
  } finally { fs.rmSync(evidenceRoot, { force: true, recursive: true }); }
});
