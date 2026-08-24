import fs from 'node:fs';
import path from 'node:path';

import { pairSyncHostPort, PAIR_SYNC_PORT } from '../sync-group/pair-sync-transport.mjs';

const APP_ID = 'com.foliole.android';
const RUNNER = `${APP_ID}.test/androidx.test.runner.AndroidJUnitRunner`;
const TEST_APK = 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk';

function executionFailure(message, details = {}) {
  return Object.assign(new Error(message), {
    failureAxis: 'execution', executionOwner: 'controller', host: 'android-b', ...details
  });
}

async function checked(execute, command, args, options, stage) {
  let result;
  try { result = await execute(command, args, options); }
  catch (error) {
    throw executionFailure(`${stage} failed`, { cause: error, result: error?.result, stage });
  }
  if (result.code !== 0) throw executionFailure(`${stage} failed`, { result, stage });
  return result;
}

async function removeOwnedTransport(execute, paths, serial, options) {
  const args = ['-s', serial, 'reverse', '--remove', `tcp:${PAIR_SYNC_PORT}`];
  const result = await execute(paths.adb, args, options);
  if (result.code === 0 || String(result.output).includes(
    `listener 'tcp:${PAIR_SYNC_PORT}' not found`
  )) return result;
  throw executionFailure('transport ownership cleanup failed', {
    result, stage: 'transport ownership cleanup'
  });
}

export async function runMacosA5InstrumentationMechanics({
  buildIdentity, env, evidenceRoot, execute, installMain = true, needsTransport = false,
  paths, restartApp = false, serial, testClass
}) {
  if (typeof testClass !== 'string' || !testClass.startsWith(`${APP_ID}.`)) {
    throw executionFailure('Android instrumentation target is invalid.', {
      missingFact: 'android_instrumentation_target'
    });
  }
  const testApk = path.join(paths.buildRoot, TEST_APK);
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const options = { env, timeoutCode: 'a5_instrumentation_timeout', timeoutMs: 3 * 60_000 };
  const hostPort = pairSyncHostPort(env);
  const output = [];
  let reverseCreated = false; let testInstalled = false;
  try {
    if (installMain) output.push((await checked(execute, paths.adb,
      ['-s', serial, 'install', '-r', paths.apk], options, 'main install')).output);
    output.push((await checked(execute, paths.adb,
      ['-s', serial, 'install', '-r', '-t', testApk], options, 'test install')).output);
    testInstalled = true;
    if (needsTransport) {
      output.push((await removeOwnedTransport(execute, paths, serial, options)).output);
      output.push((await checked(execute, paths.adb,
        ['-s', serial, 'reverse', `tcp:${PAIR_SYNC_PORT}`, `tcp:${hostPort}`],
        options, 'transport open')).output);
      reverseCreated = true;
    }
    const instrumentation = await checked(execute, paths.adb, [
      '-s', serial, 'shell', 'am', 'instrument', '-w', '-r', '-e', 'class', testClass, RUNNER
    ], options, 'instrumentation');
    output.push(instrumentation.output);
    if (String(instrumentation.stdout).includes('Foliole did not receive window focus')) {
      throw executionFailure('Foliole did not receive Android window focus.', {
        executionOwner: 'environment', missingFact: 'android_instrumentation_terminal',
        result: instrumentation, stage: 'instrumentation'
      });
    }
    if (!/^INSTRUMENTATION_CODE: -1$/mu.test(instrumentation.stdout)) {
      throw executionFailure('Instrumentation did not finish normally.', {
        missingFact: 'android_instrumentation_terminal', result: instrumentation,
        stage: 'instrumentation'
      });
    }
    if (restartApp) output.push((await checked(execute, paths.adb,
      ['-s', serial, 'shell', 'am', 'start', '-n', `${APP_ID}/.MainActivity`],
      options, 'activity restart')).output);
    const evidencePath = path.join(evidenceRoot, 'android-instrumentation-evidence.json');
    fs.writeFileSync(evidencePath, `${JSON.stringify({ buildIdentity,
      completedAt: new Date().toISOString(), resultStatus: 'success', serial,
      stdout: instrumentation.stdout, testClass
    }, null, 2)}\n`, 'utf8');
    return { evidencePath, output: output.join(''), stdout: instrumentation.stdout };
  } finally {
    if (reverseCreated) output.push((await checked(execute, paths.adb,
      ['-s', serial, 'reverse', '--remove', `tcp:${PAIR_SYNC_PORT}`],
      options, 'transport cleanup')).output);
    if (testInstalled) output.push((await checked(execute, paths.adb,
      ['-s', serial, 'uninstall', `${APP_ID}.test`], options, 'test cleanup')).output);
  }
}
