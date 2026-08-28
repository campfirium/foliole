import fs from 'node:fs';
import path from 'node:path';

import { pairSyncHostPort, PAIR_SYNC_PORT } from '../sync-group/pair-sync-transport.mjs';

const APP_ID = 'com.foliole.android';
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

async function removeOwnedAcceptanceApplication(execute, paths, serial, appId, options) {
  const result = await execute(paths.adb, ['-s', serial, 'uninstall', appId], options);
  if (result.code === 0 || /not installed|unknown package|failure \[delete_failed_internal_error\]/iu
    .test(String(result.output))) return result;
  throw executionFailure('acceptance application cleanup failed', {
    result, stage: 'acceptance application cleanup'
  });
}

async function foregroundInstrumentationTarget(execute, paths, serial, appId, options) {
  const component = `${appId}/${APP_ID}.MainActivity`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await checked(execute, paths.adb,
      ['-s', serial, 'shell', 'input', 'keyevent', 'KEYCODE_BACK'],
      options, 'system overlay dismissal');
    await checked(execute, paths.adb,
      ['-s', serial, 'shell', 'am', 'start', '-W', '-n', component],
      options, 'instrumentation activity foreground');
    const foreground = await checked(execute, paths.adb,
      ['-s', serial, 'shell', 'dumpsys', 'activity', 'activities'],
      options, 'instrumentation activity inspection');
    if (String(foreground.output).includes(component)) return;
  }
  throw executionFailure('Foliole did not own the Android foreground before instrumentation.', {
    executionOwner: 'environment', missingFact: 'android_instrumentation_foreground',
    stage: 'instrumentation activity foreground'
  });
}

export async function runMacosA5InstrumentationMechanics({
  appId = APP_ID, buildIdentity, env, evidenceRoot, execute, installMain = true,
  expectedGroupId, expectedGroupTag, instrumentationArgs = [],
  needsTransport = false, observeConcurrently = false, observeWhileTransportOpen, paths,
  releaseAfterObservation = false, restartApp = false, serial, testClass,
  testClassPrefix = APP_ID, validateInstrumentation
}) {
  if (typeof testClass !== 'string' || !testClass.startsWith(`${testClassPrefix}.`)) {
    throw executionFailure('Android instrumentation target is invalid.', {
      missingFact: 'android_instrumentation_target'
    });
  }
  const testApk = path.join(paths.buildRoot, TEST_APK);
  if (observeConcurrently && typeof observeWhileTransportOpen !== 'function') {
    throw executionFailure('Concurrent instrumentation requires an exact-fact observer.', {
      missingFact: 'sync_observation_binding'
    });
  }
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const runner = `${appId}.test/androidx.test.runner.AndroidJUnitRunner`;
  const options = { env, timeoutCode: 'a5_instrumentation_timeout', timeoutMs: 3 * 60_000 };
  const hostPort = pairSyncHostPort(env);
  const output = [];
  let concurrentObservationTask;
  let completed;
  let observationAbort;
  let reverseCreated = false; let testInstalled = false;
  try {
    if (needsTransport) output.push((await checked(execute, paths.adb,
      ['-s', serial, 'shell', 'am', 'force-stop', appId],
      options, 'transport app stop')).output);
    if (installMain && appId !== APP_ID) output.push((await removeOwnedAcceptanceApplication(
      execute, paths, serial, appId, options
    )).output);
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
    await foregroundInstrumentationTarget(execute, paths, serial, appId, options);
    const identityArgs = expectedGroupId && expectedGroupTag
      ? ['-e', 'expectedGroupId', expectedGroupId, '-e', 'expectedGroupTag', expectedGroupTag] : [];
    if ((expectedGroupId || expectedGroupTag)
        && (!/^group-[0-9a-f-]{36}$/u.test(expectedGroupId ?? '')
          || !/^[0-9a-f]{32}$/u.test(expectedGroupTag ?? ''))) {
      throw executionFailure('Android acceptance group identity is invalid.', {
        missingFact: 'sync_group_identity'
      });
    }
    const instrumentationTask = execute(paths.adb, [
      '-s', serial, 'shell', 'am', 'instrument', '-w', '-r', ...identityArgs,
      ...instrumentationArgs,
      '-e', 'class', testClass, runner
    ], options, 'instrumentation');
    let observation;
    let instrumentation;
    if (releaseAfterObservation) {
      if (typeof observeWhileTransportOpen !== 'function') {
        throw executionFailure('Controlled instrumentation requires an exact-fact observer.', {
          missingFact: 'sync_observation_binding', stage: 'instrumentation'
        });
      }
      const first = await Promise.race([
        instrumentationTask.then((result) => ({ result, type: 'instrumentation' })),
        observeWhileTransportOpen().then((result) => ({ result, type: 'observation' }))
      ]);
      if (first.type !== 'observation') {
        throw executionFailure('Sync instrumentation exited before exact-fact observation.', {
          result: first.result, stage: 'instrumentation'
        });
      }
      observation = first.result;
      output.push((await checked(execute, paths.adb,
        ['-s', serial, 'shell', 'am', 'force-stop', APP_ID],
        options, 'instrumentation controlled stop')).output);
      instrumentation = await instrumentationTask;
    } else {
      if (observeConcurrently) {
        observationAbort = new globalThis.AbortController();
        concurrentObservationTask = observeWhileTransportOpen({ signal: observationAbort.signal });
        const first = await Promise.race([
          instrumentationTask.then((result) => ({ result, type: 'instrumentation' })),
          concurrentObservationTask.then((result) => ({ result, type: 'observation' }))
        ]);
        if (first.type === 'instrumentation') instrumentation = first.result;
        else {
          observation = first.result;
          instrumentation = await instrumentationTask;
        }
      } else instrumentation = await instrumentationTask;
      if (instrumentation.code !== 0) throw executionFailure('instrumentation failed', {
        result: instrumentation, stage: 'instrumentation'
      });
    }
    output.push(instrumentation.output);
    if (String(instrumentation.stdout).includes('Foliole did not receive window focus')) {
      throw executionFailure('Foliole did not receive Android window focus.', {
        executionOwner: 'environment', missingFact: 'android_instrumentation_terminal',
        result: instrumentation, stage: 'instrumentation'
      });
    }
    if (!releaseAfterObservation && !/^INSTRUMENTATION_CODE: -1$/mu.test(instrumentation.stdout)) {
      throw executionFailure('Instrumentation did not finish normally.', {
        missingFact: 'android_instrumentation_terminal', result: instrumentation,
        stage: 'instrumentation'
      });
    }
    const evidencePath = path.join(evidenceRoot, 'android-instrumentation-evidence.json');
    fs.writeFileSync(evidencePath, `${JSON.stringify({ buildIdentity,
      completedAt: new Date().toISOString(), resultStatus: 'success', serial,
      stdout: instrumentation.stdout, testClass
    }, null, 2)}\n`, 'utf8');
    validateInstrumentation?.({ evidencePath, stdout: instrumentation.stdout });
    observation ??= concurrentObservationTask
      ? await concurrentObservationTask : await observeWhileTransportOpen?.();
    completed = { evidencePath, observation, stdout: instrumentation.stdout };
  } finally {
    observationAbort?.abort();
    if (reverseCreated) output.push((await checked(execute, paths.adb,
      ['-s', serial, 'reverse', '--remove', `tcp:${PAIR_SYNC_PORT}`],
      options, 'transport cleanup')).output);
    if (testInstalled) output.push((await checked(execute, paths.adb,
      ['-s', serial, 'uninstall', `${appId}.test`], options, 'test cleanup')).output);
  }
  if (restartApp) output.push((await checked(execute, paths.adb,
    ['-s', serial, 'shell', 'am', 'start', '-W', '-n', `${appId}/${APP_ID}.MainActivity`],
    options, 'activity restart')).output);
  return { ...completed, output: output.join('') };
}
