import { describe, expect, it } from 'vitest';

import {
  COMPANION_DATABASE_PERFORMANCE_WORKLOADS,
  evaluateCompanionDatabasePerformanceResults,
  parseCompanionDatabasePerformanceOutput
} from './companion-database-performance-contract.mjs';

function result(platform, workload, overrides = {}) {
  return {
    bridge_blob_bytes: 0,
    candidate_ms: 20,
    candidate_peak_delta_bytes: 1024,
    cleanup_verified: true,
    gate_version: 1,
    native_ms: 10,
    native_peak_delta_bytes: 1024,
    platform,
    timer_resolution_ms: 1,
    workload,
    ...overrides
  };
}

describe('companion database performance contract', () => {
  it('parses prefixed results without depending on host log framing', () => {
    const output = `noise\nFOLIOLE_DATABASE_PERFORMANCE_RESULT=${JSON.stringify(result('android', 'control_write'))}\n`;
    expect(parseCompanionDatabasePerformanceOutput(output)).toEqual([result('android', 'control_write')]);
  });

  it('requires every frozen workload on both mobile hosts', () => {
    const results = ['android', 'ios'].flatMap((platform) =>
      Object.keys(COMPANION_DATABASE_PERFORMANCE_WORKLOADS).map((workload) => result(platform, workload))
    );
    expect(evaluateCompanionDatabasePerformanceResults(results)).toEqual({ failures: [], passed: true });
  });

  it('rejects timing, memory, BLOB bridge, and cleanup regressions', () => {
    const rejected = evaluateCompanionDatabasePerformanceResults([
      result('android', 'control_write', {
        bridge_blob_bytes: 1,
        candidate_ms: 21,
        candidate_peak_delta_bytes: 65 * 1024 * 1024,
        cleanup_verified: false
      })
    ], ['android']);
    expect(rejected.passed).toBe(false);
    expect(rejected.failures).toEqual(expect.arrayContaining([
      expect.stringContaining('exceeds'),
      expect.stringContaining('BLOB bytes'),
      expect.stringContaining('order of magnitude'),
      expect.stringContaining('cleanup')
    ]));
  });
});
