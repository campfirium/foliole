import fs from 'node:fs';
import path from 'node:path';

import { PAIR_SYNC_PORT } from '../windows/windows-a5-pair-sync-recovery-transport.mjs';

const APP_ID = 'com.foliole.android';
const RUNNER = `${APP_ID}.test/androidx.test.runner.AndroidJUnitRunner`;
const TEST_APK = 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk';

async function checked(execute, command, args, options, stage) {
  const result = await execute(command, args, options);
  if (result.code !== 0) throw Object.assign(new Error(`${stage} failed`), { result, stage });
  return result;
}

function bundle(output, key) {
  const prefix = `INSTRUMENTATION_STATUS: ${key}=`;
  const line = String(output).split(/\r?\n/u).find((entry) => entry.startsWith(prefix));
  if (!line) throw Object.assign(new Error(`Instrumentation did not emit ${key}`), {
    result: { output: String(output) }
  });
  return JSON.parse(line.slice(prefix.length));
}

export async function runMacosA5SyncGroupMaintenance({
  action, buildIdentity, env, evidenceRoot, execute, paths, serial
}) {
  if (!['leave-sync-group', 'clear-app-data'].includes(action)) throw new Error('Unsupported maintenance action');
  const method = action === 'leave-sync-group'
    ? 'leavesSyncGroupThroughProduct'
    : 'clearsAppDataThroughProduct';
  const testApk = path.join(paths.repoRoot, TEST_APK);
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const options = { env, timeoutCode: 'sync_group_maintenance_timeout', timeoutMs: 3 * 60_000 };
  const output = [];
  let reverseCreated = false;
  let testInstalled = false;
  try {
    output.push((await checked(execute, paths.adb, ['-s', serial, 'install', '-r', paths.apk], options, 'main install')).output);
    output.push((await checked(execute, paths.adb, ['-s', serial, 'install', '-r', '-t', testApk], options, 'test install')).output);
    testInstalled = true;
    if (action === 'leave-sync-group') {
      output.push((await checked(execute, paths.adb,
        ['-s', serial, 'reverse', `tcp:${PAIR_SYNC_PORT}`, `tcp:${PAIR_SYNC_PORT}`],
        options, 'product transport')).output);
      reverseCreated = true;
    }
    const testClass = `${APP_ID}.FolioleCompanionSyncGroupMaintenanceTest#${method}`;
    const instrumentation = await checked(execute, paths.adb, [
      '-s', serial, 'shell', 'am', 'instrument', '-w', '-r', '-e', 'class', testClass, RUNNER
    ], options, 'product instrumentation');
    output.push(instrumentation.output);
    if (!/^INSTRUMENTATION_CODE: -1$/mu.test(instrumentation.stdout)) throw new Error('Product instrumentation did not finish');
    const receipt = bundle(instrumentation.stdout, 'folioleActionReceipt');
    const expected = action === 'leave-sync-group' ? 'departurePersisted' : 'appDataCleared';
    if (receipt[expected] !== true) throw new Error(`Product receipt did not prove ${expected}`);
    const manifestPath = path.join(evidenceRoot, 'sync-group-maintenance-manifest.json');
    fs.writeFileSync(manifestPath, `${JSON.stringify({ action,
      after: bundle(instrumentation.stdout, 'folioleAfterSemantic'), buildIdentity,
      completedAt: new Date().toISOString(), receipt, resultStatus: 'success', serial, testClass
    }, null, 2)}\n`, 'utf8');
    return { manifestPath, output: output.join('') };
  } finally {
    if (reverseCreated) output.push((await checked(execute, paths.adb,
      ['-s', serial, 'reverse', '--remove', `tcp:${PAIR_SYNC_PORT}`],
      options, 'product transport cleanup')).output);
    if (testInstalled) output.push((await checked(execute, paths.adb,
      ['-s', serial, 'uninstall', `${APP_ID}.test`], options, 'test cleanup')).output);
  }
}
