import fs from 'node:fs';
import path from 'node:path';
import { assertPerformanceApkIdentity, performanceScenario, PERFORMANCE_APP_ID } from './a5-database-performance-build.mjs';
import { parseLibraryCapacityResult } from '../mobile/library-capacity-result.mjs';
import { extractTopActivity, matchesLaunchComponent } from './verify-android-launch.mjs';
import { removeA5AcceptanceApplication } from './macos-a5-acceptance-package-cleanup.mjs';

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
const WORKSPACE_CAPACITY_TEST_CLASS = `${TEST_NAMESPACE}.FolioleLibraryWorkspaceCapacityTest`;

export async function runA5DatabasePerformance({ env, evidenceRoot, execute, captured, paths, serial }) {
  const identities = assertPerformanceApkIdentity({ captured, paths, env });
  const scenario = performanceScenario(env);
  const capacity = scenario === 'library-capacity';
  const workspaceCapacity = scenario === 'library-capacity-workspace';
  const resetFixture = env.FOLIOLE_DATABASE_PERFORMANCE_RESET_CAPACITY_FIXTURE;
  if (resetFixture !== undefined && (resetFixture !== '1' || !capacity)) {
    throw new Error('Capacity fixture reset requires the explicit library-capacity scenario and value 1.');
  }
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const testApk = paths.androidTestApk;
  const options = { env, timeoutCode: 'database_performance_timeout', timeoutMs: 20 * 60_000 };
  const output = [];
  let testInstalled = false;
  try {
    if (resetFixture === '1') {
      await removeA5AcceptanceApplication({ env, execute, paths, serial });
      fs.writeFileSync(path.join(evidenceRoot, 'capacity-fixture-reset.json'),
        `${JSON.stringify({ appId: APP_ID, serial, scenario: 'library-capacity', identities,
          status: 'reset', resetAt: new Date().toISOString() }, null, 2)}\n`);
    }
    output.push((await checked(execute, paths.adb, ['-s', serial, 'install', '-r', paths.apk], options)).output);
    output.push((await checked(execute, paths.adb, ['-s', serial, 'install', '-r', '-t', testApk], options)).output);
    testInstalled = true;
    let result;
    if (workspaceCapacity) {
      for (const method of [
        'measuresNormalCompanionWorkspaceAtOneThousand',
        'measuresNormalCompanionWorkspaceAtTenThousand'
      ]) {
        result = await checked(execute, paths.adb, [
          '-s', serial, 'shell', 'am', 'instrument', '-w', '-r',
          '-e', 'class', `${WORKSPACE_CAPACITY_TEST_CLASS}#${method}`, RUNNER
        ], options);
        output.push(result.output);
        fs.writeFileSync(path.join(evidenceRoot, `android-workspace-capacity-${method}.log`), result.output);
        assertSingleInstrumentationPassed(result.output, `${WORKSPACE_CAPACITY_TEST_CLASS}#${method}`);
      }
    } else {
      result = await checked(execute, paths.adb, [
        '-s', serial, 'shell', 'am', 'instrument', '-w', '-r',
        '-e', 'class', capacity ? `${TEST_NAMESPACE}.FolioleLibraryCapacityTest` : TEST_CLASS, RUNNER
      ], options);
      output.push(result.output);
    }
    if (capacity) return await saveCapacityEvidence({ evidenceRoot, identities, result, output,
      execute, paths, serial, options });
    if (workspaceCapacity) return await saveWorkspaceCapacityEvidence({ evidenceRoot, identities, result, output,
      execute, paths, serial, options });
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

async function saveWorkspaceCapacityEvidence(args) {
  const { evidenceRoot, identities, result, output, execute, paths, serial, options } = args;
  fs.writeFileSync(path.join(evidenceRoot, 'android-workspace-capacity.log'), result.output);
  if (!/OK \(1 test\)/u.test(result.output) || /FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=/u.test(result.output)) {
    throw new Error('Normal workspace capacity instrumentation failed.');
  }
  const artifact = await checked(execute, paths.adb, ['-s', serial, 'exec-out', 'run-as', APP_ID,
    'cat', 'files/t219-library-workspace-capacity.json'], options);
  const parsed = JSON.parse(artifact.output);
  if (parsed.status !== 'passed' || parsed.scenario !== 'library-capacity-workspace'
    || parsed.results?.length !== 2) throw new Error('Normal workspace capacity artifact is invalid.');
  const evidencePath = path.join(evidenceRoot, 'workspace-capacity-result.json');
  fs.writeFileSync(evidencePath, `${JSON.stringify({ ...parsed, identities }, null, 2)}\n`);
  return { evidencePath, output: output.join('') };
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

async function saveCapacityEvidence({ evidenceRoot, identities, result, output, execute, paths, serial, options }) {
  fs.writeFileSync(path.join(evidenceRoot, 'android-performance.log'), result.output);
  if (!/OK \(1 test\)/u.test(result.output) || /FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=/u.test(result.output)) {
    throw new Error('Library capacity instrumentation failed.');
  }
  const artifact = await checked(execute, paths.adb, ['-s', serial, 'exec-out', 'run-as', APP_ID,
    'cat', 'files/t219-library-capacity.json'], options);
  fs.writeFileSync(path.join(evidenceRoot, 'capacity-result.json'), artifact.output);
  const measurements = parseLibraryCapacityResult(`FOLIOLE_LIBRARY_CAPACITY_RESULT=${artifact.output}`);
  const evidencePath = path.join(evidenceRoot, 'android-performance.json');
  fs.writeFileSync(evidencePath, `${JSON.stringify({ identities, measurements }, null, 2)}\n`);
  return { evidencePath, output: output.join('') };
}

function assertInstrumentationPassed(output, testClass) {
  if (/FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=/u.test(output) || !/OK \(2 tests\)/u.test(output)) {
    throw new Error(`Android lifecycle plugin contract failed: ${testClass}`);
  }
}

function assertSingleInstrumentationPassed(output, testClass) {
  if (/FAILURES!!!|INSTRUMENTATION_FAILED|shortMsg=/u.test(output) || !/OK \(1 test\)/u.test(output)) {
    throw new Error(`Android instrumentation failed: ${testClass}`);
  }
}

async function checked(execute, command, args, options) {
  const result = await execute(command, args, options);
  if (result.code !== 0) throw Object.assign(new Error(`${path.basename(command)} exited ${result.code}`), { result });
  return result;
}
