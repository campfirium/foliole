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
  it('runs only the fixed instrumentation class and persists passing evidence', async () => {
    const evidenceRoot = fs.mkdtempSync(path.join(process.cwd(), '.tmp/artifacts/a5-performance-test-'));
    created.push(evidenceRoot);
    const calls = [];
    const execute = async (command, args) => {
      calls.push([command, args]);
      const isInstrumentation = args.includes('instrument');
      return { code: 0, output: isInstrumentation ? performanceOutput() : 'Success\n', stderr: '', stdout: '' };
    };
    const result = await runA5DatabasePerformance({
      env: {}, evidenceRoot, execute,
      paths: { adb: '/fixed/adb', apk: '/repo/main.apk', repoRoot: '/repo' },
      serial: 'fixed-a5'
    });
    const evidence = JSON.parse(fs.readFileSync(result.evidencePath, 'utf8'));
    expect(evidence.gate).toEqual({ failures: [], passed: true });
    expect(evidence.measurements).toHaveLength(5);
    expect(calls.find(([, args]) => args.includes('instrument'))?.[1]).toContain(
      'com.foliole.android.FolioleCompanionDatabasePerformanceGateTest'
    );
    expect(calls.at(-1)?.[1]).toEqual(['-s', 'fixed-a5', 'uninstall', 'com.foliole.android.test']);
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
