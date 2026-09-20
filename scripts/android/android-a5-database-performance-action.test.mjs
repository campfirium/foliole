/* global process */
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { COMPANION_DATABASE_PERFORMANCE_WORKLOADS } from '../mobile/companion-database-performance-contract.mjs';
import { runA5DatabasePerformance } from './android-a5-database-performance-action.mjs';

const created = [];

afterEach(() => {
  for (const directory of created.splice(0)) fs.rmSync(directory, { force: true, recursive: true });
});

describe('fixed A5 database performance action', () => {
  it('runs the fixed performance and lifecycle contracts and persists passing evidence', async () => {
    const evidenceRoot = fs.mkdtempSync(path.join(process.cwd(), '.tmp/artifacts/a5-performance-test-'));
    created.push(evidenceRoot);
    const calls = [];
    const execute = async (command, args) => {
      calls.push([command, args]);
      const isContract = args.includes('com.foliole.android.FolioleCompanionDatabaseLifecyclePluginContractTest')
        || args.includes('com.foliole.android.FolioleCompanionBatchDataPlaneTest');
      const isInstrumentation = args.includes('instrument');
      const output = args.includes('dumpsys') ? 'topResumedActivity=ActivityRecord{123 u0 com.foliole.android.acceptance/com.foliole.android.MainActivity}' : isContract ? 'OK (2 tests)\n' : isInstrumentation ? performanceOutput() : 'Success\n';
      return { code: 0, output, stderr: '', stdout: '' };
    };
    const result = await runA5DatabasePerformance({
      env: { ANDROID_SDK_ROOT: "/sdk" }, evidenceRoot, execute,
      captured: (_command, args) => args.at(-1) === "/repo/main.apk"
        ? '<manifest package="com.foliole.android.acceptance"/>'
        : '<manifest package="com.foliole.android.acceptance.test"><instrumentation android:targetPackage="com.foliole.android.acceptance" android:name="androidx.test.runner.AndroidJUnitRunner"/></manifest>',
      paths: { adb: '/fixed/adb', apk: '/repo/main.apk', androidTestApk: '/repo/test.apk', buildRoot: '/repo' },
      serial: 'fixed-a5'
    });
    const evidence = JSON.parse(fs.readFileSync(result.evidencePath, 'utf8'));
    expect(evidence.gate).toEqual({ failures: [], passed: true });
    expect(evidence.measurements).toHaveLength(5);
    expect(calls.find(([, args]) => args.includes('-t'))?.[1].at(-1)).toBe('/repo/test.apk');
    const instrumentation = calls.filter(([, args]) => args.includes('instrument')).map(([, args]) => args);
    expect(instrumentation[0]).toContain(
      'com.foliole.android.FolioleCompanionDatabasePerformanceGateTest'
    );
    expect(instrumentation[1]).toContain(
      'com.foliole.android.FolioleCompanionDatabaseLifecyclePluginContractTest'
    );
    expect(instrumentation[2]).toContain(
      'com.foliole.android.FolioleCompanionBatchDataPlaneTest'
    );
    expect(calls.at(-3)?.[1]).toEqual(['-s', 'fixed-a5', 'uninstall', 'com.foliole.android.acceptance.test']);
    expect(calls.at(-2)?.[1]).toContain('com.foliole.android.acceptance/com.foliole.android.MainActivity');
  });
});

function performanceOutput() {
  return Object.keys(COMPANION_DATABASE_PERFORMANCE_WORKLOADS).map((workload) =>
    `INSTRUMENTATION_STATUS: stream=FOLIOLE_DATABASE_PERFORMANCE_RESULT=${JSON.stringify({
      bridge_blob_bytes: 0, candidate_ms: 10, candidate_peak_delta_bytes: 1024,
      cleanup_verified: true, gate_version: 1, native_ms: 10,
      native_peak_delta_bytes: 1024, platform: 'android', timer_resolution_ms: 1, workload
    })}`
  ).join('\n');
}

it('refuses a mismatched APK before any device command', async () => {
  const calls = [];
  await expect(runA5DatabasePerformance({ env: { ANDROID_SDK_ROOT: '/sdk', FOLIOLE_DATABASE_PERFORMANCE_RESET_CAPACITY_FIXTURE: '1' }, paths: {},
    captured: () => '<manifest package="com.foliole.android"/>',
    execute: (...args) => calls.push(args)
  })).rejects.toThrow('identities');
  expect(calls).toEqual([]);
});

it.each([false, true])('runs capacity with explicit reset=%s and restores the isolated activity', async (reset) => {
  const evidenceRoot = fs.mkdtempSync(path.join(process.cwd(), '.tmp/artifacts/a5-capacity-test-'));
  created.push(evidenceRoot);
  const calls = [];
  const result = { status: 'passed', scenario: 'library-capacity', appId: 'com.foliole.android.acceptance',
    platform: 'android', results: [1000, 10000].map(count => ({
      fixture: { count, bodyBytes: 4096, imports: 0, analyzed: false },
      environment: { version: [{ version: 'test-only' }] }, plans: [{}],
      runs: Array.from({ length: 4 }, () => ({ totalMs: 2, queryWallMs: 1, jsResidualMs: 1, snapshotHash: 'a'.repeat(64) }))
    })) };
  const outcome = await runA5DatabasePerformance({
    env: { ANDROID_SDK_ROOT: '/sdk', FOLIOLE_DATABASE_PERFORMANCE_SCENARIO: 'library-capacity',
      ...(reset ? { FOLIOLE_DATABASE_PERFORMANCE_RESET_CAPACITY_FIXTURE: '1' } : {}) },
    evidenceRoot, serial: 'fixed-a5',
    paths: { adb: '/adb', apk: '/app.apk', androidTestApk: '/test.apk', buildRoot: '/repo' },
    captured: (_cmd, args) => args.at(-1) === '/app.apk'
      ? '<manifest package="com.foliole.android.acceptance"/>'
      : '<manifest package="com.foliole.android.acceptance.test"><instrumentation android:targetPackage="com.foliole.android.acceptance" android:name="androidx.test.runner.AndroidJUnitRunner"/></manifest>',
    execute: async (_command, args) => {
      calls.push(args);
      return { code: 0, output: args.includes('dumpsys')
        ? 'topResumedActivity=ActivityRecord{123 u0 com.foliole.android.acceptance/com.foliole.android.MainActivity}' : args.includes('instrument')
        ? `FOLIOLE_LIBRARY_CAPACITY_RESULT=${JSON.stringify(result)}\nOK (1 test)\n` : 'Success' };
    }
  });
  expect(calls.filter(args => args.includes('instrument'))).toHaveLength(1);
  expect(calls.find(args => args.includes('instrument'))).toContain('com.foliole.android.FolioleLibraryCapacityTest');
  expect(calls.at(-2)).toContain('com.foliole.android.acceptance/com.foliole.android.MainActivity');
  expect(JSON.parse(fs.readFileSync(outcome.evidencePath)).measurements).toEqual(result);
  const appRemoval = calls.findIndex(args => args.includes('uninstall') && args.at(-1) === 'com.foliole.android.acceptance');
  expect(appRemoval >= 0).toBe(reset);
  expect(calls.some(args => args.includes('com.foliole.android'))).toBe(false);
  if (reset) {
    expect(appRemoval).toBeLessThan(calls.findIndex(args => args.includes('install')));
    expect(JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'capacity-fixture-reset.json'))))
      .toMatchObject({ appId: 'com.foliole.android.acceptance', status: 'reset' });
  }
});


it.each([
  { FOLIOLE_DATABASE_PERFORMANCE_RESET_CAPACITY_FIXTURE: '1' },
  { FOLIOLE_DATABASE_PERFORMANCE_SCENARIO: 'library-capacity', FOLIOLE_DATABASE_PERFORMANCE_RESET_CAPACITY_FIXTURE: 'true' }
])('rejects reset outside the exact capacity opt-in before device commands', async env => {
  const calls = [];
  await expect(runA5DatabasePerformance({
    env: { ANDROID_SDK_ROOT: '/sdk', ...env }, paths: { apk: '/app.apk', androidTestApk: '/test.apk' },
    captured: (_cmd, args) => args.at(-1) === '/app.apk'
      ? '<manifest package="com.foliole.android.acceptance"/>'
      : '<manifest package="com.foliole.android.acceptance.test"><instrumentation android:targetPackage="com.foliole.android.acceptance" android:name="androidx.test.runner.AndroidJUnitRunner"/></manifest>',
    execute: (...args) => calls.push(args)
  })).rejects.toThrow('reset requires');
  expect(calls).toEqual([]);
});
