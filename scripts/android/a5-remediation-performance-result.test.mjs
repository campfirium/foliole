import { expect, it } from 'vitest';
import { assertRemediationPerformanceResult } from './a5-remediation-performance-result.mjs';

function result() {
  return { status: 'passed', scenario: 'remediation-performance',
    appId: 'com.campfirium.foliole.android.acceptance', platform: 'android', cleanup: true,
    externalLifecycle: { hiddenRetained: true, rejoinRestored: true, retainedBeforeExpiry: true,
      purgedAtExpiry: true, activeProviderPreserved: true, noDeletionRecords: true },
    fixtureNodes: 1000, scan: { scanDiscardedForWrite: true, queryCount: 21, references: 1, scanMs: 10, scoreWaitAndWriteMs: 11 },
    mixed: { fullReads: 0, snapshotMatches: true, elapsedMs: 3 },
    details: { queryCount: 1, expandedNodes: 500, detailsMatch: true, elapsedMs: 2 } };
}
it('accepts complete evidence from the isolated package', () => {
  expect(() => assertRemediationPerformanceResult(result())).not.toThrow();
});
it.each(['identity', 'cleanup', 'batch', 'snapshot', 'timing'])('rejects invalid %s evidence', kind => {
  const value = result();
  if (kind === 'identity') value.appId = 'com.campfirium.foliole.android';
  if (kind === 'cleanup') value.cleanup = false;
  if (kind === 'batch') value.details.queryCount = 500;
  if (kind === 'snapshot') value.mixed.snapshotMatches = false;
  if (kind === 'timing') value.scan.scanMs = NaN;
  expect(() => assertRemediationPerformanceResult(value)).toThrow();
});

it('routes the fixed scenario to its single test and restores the isolated app', async () => {
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { runA5DatabasePerformance } = await import('./android-a5-database-performance-action.mjs');
  const root = mkdtempSync(join(tmpdir(), 'remediation-result-'));
  const calls = [];
  const app = 'com.campfirium.foliole.android.acceptance';
  try {
    const saved = await runA5DatabasePerformance({
      env: { ANDROID_SDK_ROOT: '/sdk', FOLIOLE_DATABASE_PERFORMANCE_SCENARIO: 'remediation-performance' },
      evidenceRoot: root, serial: 'fixed', paths: { adb: '/adb', apk: '/app', androidTestApk: '/test' },
      captured: (_cmd, args) => args.at(-1) === '/app' ? `<manifest package="${app}"/>`
        : `<manifest package="${app}.test"><instrumentation android:targetPackage="${app}" android:name="androidx.test.runner.AndroidJUnitRunner"/></manifest>`,
      execute: async (_cmd, args) => {
        calls.push(args);
        return { code: 0, output: args.includes('instrument') ? 'OK (1 test)'
          : args.includes('cat') ? JSON.stringify(result())
          : args.includes('dumpsys') ? `topResumedActivity=ActivityRecord{123 u0 ${app}/com.foliole.android.MainActivity}` : 'Success' };
      }
    });
    expect(JSON.parse(readFileSync(saved.evidencePath, 'utf8'))).toEqual(result());
    expect(calls.filter(args => args.includes('instrument'))).toHaveLength(1);
    expect(calls.find(args => args.includes('instrument'))).toContain('com.foliole.android.FolioleRemediationPerformanceAcceptanceTest');
    expect(calls.find(args => args.includes('uninstall'))).toContain(`${app}.test`);
    expect(calls.some(args => args.includes('clear'))).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it.each(['hiddenRetained', 'rejoinRestored', 'retainedBeforeExpiry', 'purgedAtExpiry',
  'activeProviderPreserved', 'noDeletionRecords'])('rejects absent or failed External proof: %s', key => {
  const value = result();
  value.externalLifecycle[key] = false;
  expect(() => assertRemediationPerformanceResult(value)).toThrow('External lifecycle');
  delete value.externalLifecycle[key];
  expect(() => assertRemediationPerformanceResult(value)).toThrow('External lifecycle');
});
