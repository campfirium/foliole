import fs from 'node:fs';
import path from 'node:path';
import { assertPerformanceApkIdentity, performanceScenario, PERFORMANCE_APP_ID } from './a5-database-performance-build.mjs';
import { parseLibraryCapacityResult } from '../mobile/library-capacity-result.mjs';
import { extractTopActivity, matchesLaunchComponent } from './verify-android-launch.mjs';

import {
  evaluateCompanionDatabasePerformanceResults,
  parseCompanionDatabasePerformanceOutput
} from '../mobile/companion-database-performance-contract.mjs';

const APP_ID = PERFORMANCE_APP_ID;
const TEST_NAMESPACE = 'com.foliole.android';
const TEST_APP_ID = `${APP_ID}.test`;
const RUNNER = `${TEST_APP_ID}/androidx.test.runner.AndroidJUnitRunner`;
const TEST_CLASS = `${TEST_NAMESPACE}.FolioleCompanionDatabasePerformanceGateTest`;
const LIFECYCLE_TEST_CLASS = `${TEST_NAMESPACE}.FolioleCompanionDatabaseLifecyclePluginContractTest`;
const BATCH_DATA_PLANE_TEST_CLASS = `${TEST_NAMESPACE}.FolioleCompanionBatchDataPlaneTest`;

export async function runA5DatabasePerformance({ env, evidenceRoot, execute, captured, paths, serial }) {
  const identities = assertPerformanceApkIdentity({ captured, paths, env });
  const capacity = performanceScenario(env) === 'library-capacity';
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const testApk = paths.androidTestApk;
  const options = { env, timeoutCode: 'database_performance_timeout', timeoutMs: 20 * 60_000 };
  const output = [];
  let testInstalled = false;
  try {
    output.push((await checked(execute, paths.adb, ['-s', serial, 'install', '-r', paths.apk], options)).output);
    output.push((await checked(execute, paths.adb, ['-s', serial, 'install', '-r', '-t', testApk], options)).output);
    testInstalled = true;
    const result = await checked(execute, paths.adb, [
      '-s', serial, 'shell', 'am', 'instrument', '-w', '-r',
      '-e', 'class', capacity ? `${TEST_NAMESPACE}.FolioleLibraryCapacityTest` : TEST_CLASS, RUNNER
    ], options);
    output.push(result.output);
    if (capacity) return saveCapacityEvidence({ evidenceRoot, identities, result, output });
    for (const testClass of [LIFECYCLE_TEST_CLASS, BATCH_DATA_PLANE_TEST_CLASS]) {
      const contract = await checked(execute, paths.adb, [
        '-s', serial, 'shell', 'am', 'instrument', '-w', '-r', '-e', 'class', testClass, RUNNER
      ], options);
      assertInstrumentationPassed(contract.output, testClass);
      output.push(contract.output);
    }
    const rawOutputPath = path.join(evidenceRoot, 'android-performance.log');
    fs.writeFileSync(rawOutputPath, result.output);
    const measurements = parseCompanionDatabasePerformanceOutput(result.output);
    const gate = evaluateCompanionDatabasePerformanceResults(measurements, ['android']);
    const evidence = { gate, measurements, platform: 'android', rawOutputPath, schemaVersion: 1 };
    const evidencePath = path.join(evidenceRoot, 'android-performance.json');
    fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
    if (!gate.passed) throw new Error(`Android database performance gate failed: ${gate.failures.join('; ')}`);
    return { evidencePath, output: output.join('') };
  } finally {
    if (testInstalled) await restoreAcceptanceActivity({ execute, paths, serial, options, evidenceRoot });
  }
}

async function restoreAcceptanceActivity({ execute, paths, serial, options, evidenceRoot }) {
  await checked(execute, paths.adb, ['-s', serial, 'uninstall', TEST_APP_ID], options);
  const component = `${APP_ID}/com.foliole.android.MainActivity`;
  await checked(execute, paths.adb, ['-s', serial, 'shell', 'am', 'start', '-W', '-n', component], options);
  const foreground = await checked(execute, paths.adb,
    ['-s', serial, 'shell', 'dumpsys', 'activity', 'activities'], options);
  fs.writeFileSync(path.join(evidenceRoot, 'android-foreground.txt'), foreground.output);
  if (!matchesLaunchComponent(extractTopActivity(foreground.output), component, APP_ID)) {
    throw new Error('Acceptance Activity was not restored to the foreground.');
  }
}

function saveCapacityEvidence({ evidenceRoot, identities, result, output }) {
  fs.writeFileSync(path.join(evidenceRoot, 'android-performance.log'), result.output);
  if (!/OK \(1 test\)/u.test(result.output) || /FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=/u.test(result.output)) {
    throw new Error('Library capacity instrumentation failed.');
  }
  const measurements = parseLibraryCapacityResult(result.output);
  const evidencePath = path.join(evidenceRoot, 'android-performance.json');
  fs.writeFileSync(evidencePath, `${JSON.stringify({ identities, measurements }, null, 2)}\n`);
  return { evidencePath, output: output.join('') };
}

function assertInstrumentationPassed(output, testClass) {
  if (/FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=/u.test(output) || !/OK \(2 tests\)/u.test(output)) {
    throw new Error(`Android lifecycle plugin contract failed: ${testClass}`);
  }
}

async function checked(execute, command, args, options) {
  const result = await execute(command, args, options);
  if (result.code !== 0) throw Object.assign(new Error(`${path.basename(command)} exited ${result.code}`), { result });
  return result;
}
