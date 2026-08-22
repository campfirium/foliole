import fs from 'node:fs';
import path from 'node:path';

import {
  pairSyncHostPort, PAIR_SYNC_PORT
} from '../windows/windows-a5-pair-sync-recovery-transport.mjs';

const APP_ID = 'com.foliole.android';
const RUNNER = `${APP_ID}.test/androidx.test.runner.AndroidJUnitRunner`;
const TEST_APK = 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk';

async function checked(execute, command, args, options, stage) {
  const result = await execute(command, args, options);
  if (result.code !== 0) {
    const detail = String(result.output || result.stderr || result.stdout || '');
    const focusMissing = detail.includes('Foliole did not receive window focus');
    throw Object.assign(new Error(focusMissing
      ? 'Foliole did not receive Android window focus.' : `${stage} failed`), {
      ...(stage === 'product instrumentation' ? {
        failureOwner: focusMissing ? 'environment' : 'product', host: 'android-b',
        lastSuccessfulAction: 'android_activity_started',
        missingFact: focusMissing ? 'android_app_window_focus_missing' : 'product_instrumentation_failed'
      } : {}), result, stage
    });
  }
  return result;
}

function bundle(output, key) {
  const prefix = `INSTRUMENTATION_STATUS: ${key}=`;
  const line = String(output).split(/\r?\n/u).find((entry) => entry.startsWith(prefix));
  if (!line) {
    const focusMissing = String(output).includes('Foliole did not receive window focus');
    throw Object.assign(new Error(focusMissing
      ? 'Foliole did not receive Android window focus.' : `Instrumentation did not emit ${key}`), {
      failureOwner: focusMissing ? 'environment' : 'product', host: 'android-b',
      lastSuccessfulAction: 'android_activity_started',
      missingFact: focusMissing ? 'android_app_window_focus_missing' : 'product_action_receipt',
      result: { output: String(output) }
    });
  }
  return JSON.parse(line.slice(prefix.length));
}

export async function runMacosA5SyncGroupMaintenance({
  action, buildIdentity, env, evidenceRoot, execute, installMain = true, paths, serial
}) {
  if (!['leave-sync-group', 'clear-app-data', 'activate-participation', 'control-participation',
    'create-journey-fact', 'pause-and-leave', 'pause-participation',
    'resume-participation'].includes(action)) {
    throw new Error('Unsupported maintenance action');
  }
  const methods = { 'activate-participation': 'activatesSyncParticipationThroughProduct',
    'clear-app-data': 'clearsAppDataThroughProduct',
    'control-participation': 'controlsSyncParticipationThroughProduct',
    'create-journey-fact': 'createsJourneyFactThroughProduct',
    'leave-sync-group': 'leavesSyncGroupThroughProduct',
    'pause-and-leave': 'pausesAndLeavesSyncGroupThroughProduct',
    'pause-participation': 'pausesSyncParticipationThroughProduct',
    'resume-participation': 'resumesSyncParticipationThroughProduct' };
  const method = methods[action];
  const testApk = path.join(paths.buildRoot, TEST_APK);
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const options = { env, timeoutCode: 'sync_group_maintenance_timeout', timeoutMs: 3 * 60_000 };
  const hostPort = pairSyncHostPort(env);
  const output = [];
  let reverseCreated = false;
  let testInstalled = false;
  try {
    if (installMain) {
      output.push((await checked(execute, paths.adb, ['-s', serial, 'install', '-r', paths.apk], options, 'main install')).output);
    }
    output.push((await checked(execute, paths.adb, ['-s', serial, 'install', '-r', '-t', testApk], options, 'test install')).output);
    testInstalled = true;
    if (action === 'leave-sync-group' || action === 'pause-and-leave') {
      output.push((await checked(execute, paths.adb,
        ['-s', serial, 'reverse', `tcp:${PAIR_SYNC_PORT}`, `tcp:${hostPort}`],
        options, 'product transport')).output);
      reverseCreated = true;
    }
    const testClass = `${APP_ID}.FolioleCompanionSyncGroupMaintenanceTest#${method}`;
    const instrumentation = await checked(execute, paths.adb, [
      '-s', serial, 'shell', 'am', 'instrument', '-w', '-r', '-e', 'class', testClass, RUNNER
    ], options, 'product instrumentation');
    output.push(instrumentation.output);
    if (!/^INSTRUMENTATION_CODE: -1$/mu.test(instrumentation.stdout)) {
      throw Object.assign(new Error('Product instrumentation did not finish'), {
        failureOwner: 'product', host: 'android-b',
        lastSuccessfulAction: 'android_activity_started', missingFact: 'product_instrumentation_failed',
        result: instrumentation
      });
    }
    const receipt = bundle(instrumentation.stdout, 'folioleActionReceipt');
    const expected = action === 'leave-sync-group' || action === 'pause-and-leave'
      ? 'departurePersisted' : action === 'create-journey-fact' ? 'factPersisted'
        : action === 'activate-participation' ? 'activated'
          : action === 'control-participation' || action === 'resume-participation' ? 'resumed'
          : action === 'pause-participation' ? 'paused' : 'appDataCleared';
    if (receipt[expected] !== true) throw new Error(`Product receipt did not prove ${expected}`);
    if (['activate-participation', 'control-participation',
      'create-journey-fact', 'resume-participation'].includes(action)) {
      output.push((await checked(execute, paths.adb, [
        '-s', serial, 'shell', 'am', 'start', '-n', `${APP_ID}/.MainActivity`
      ], options, 'provider resume')).output);
    }
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
