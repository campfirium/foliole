import fs from 'node:fs';
import path from 'node:path';

import {
  evaluateCompanionDatabasePerformanceResults,
  parseCompanionDatabasePerformanceOutput
} from '../mobile/companion-database-performance-contract.mjs';

const APP_ID = 'com.foliole.android';
const TEST_APP_ID = `${APP_ID}.test`;
const RUNNER = `${TEST_APP_ID}/androidx.test.runner.AndroidJUnitRunner`;
const TEST_CLASS = `${APP_ID}.FolioleCompanionDatabasePerformanceGateTest`;
const LIFECYCLE_TEST_CLASS = `${APP_ID}.FolioleCompanionDatabaseLifecyclePluginContractTest`;
const BATCH_DATA_PLANE_TEST_CLASS = `${APP_ID}.FolioleCompanionBatchDataPlaneTest`;

export async function runA5DatabasePerformance({ env, evidenceRoot, execute, paths, serial }) {
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const testApk = path.join(
    paths.buildRoot, 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'
  );
  const options = { env, timeoutCode: 'database_performance_timeout', timeoutMs: 15 * 60_000 };
  const output = [];
  let testInstalled = false;
  try {
    output.push((await checked(execute, paths.adb, ['-s', serial, 'install', '-r', paths.apk], options)).output);
    output.push((await checked(execute, paths.adb, ['-s', serial, 'install', '-r', '-t', testApk], options)).output);
    testInstalled = true;
    const result = await checked(execute, paths.adb, [
      '-s', serial, 'shell', 'am', 'instrument', '-w', '-r',
      '-e', 'class', TEST_CLASS, RUNNER
    ], options);
    output.push(result.output);
    const lifecycle = await checked(execute, paths.adb, [
      '-s', serial, 'shell', 'am', 'instrument', '-w', '-r',
      '-e', 'class', LIFECYCLE_TEST_CLASS, RUNNER
    ], options);
    assertInstrumentationPassed(lifecycle.output, LIFECYCLE_TEST_CLASS);
    output.push(lifecycle.output);
    const batchDataPlane = await checked(execute, paths.adb, [
      '-s', serial, 'shell', 'am', 'instrument', '-w', '-r',
      '-e', 'class', BATCH_DATA_PLANE_TEST_CLASS, RUNNER
    ], options);
    assertInstrumentationPassed(batchDataPlane.output, BATCH_DATA_PLANE_TEST_CLASS);
    output.push(batchDataPlane.output);
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
    if (testInstalled) output.push((await checked(execute, paths.adb, ['-s', serial, 'uninstall', TEST_APP_ID], options)).output);
  }
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
