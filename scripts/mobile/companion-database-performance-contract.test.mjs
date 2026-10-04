import { describe, expect, it } from 'vitest';

import {
  COMPANION_DATABASE_PERFORMANCE_GATE_VERSION,
  COMPANION_DATABASE_PERFORMANCE_WORKLOADS,
  evaluateCompanionDatabasePerformanceResults,
  parseCompanionDatabasePerformanceOutput
} from './companion-database-performance-contract.mjs';

function result(platform, workload, overrides = {}) {
  return {
    bridge_blob_bytes: 0,
    bridge_observation: 'observed',
    candidate_ms: 20,
    candidate_peak_delta_bytes: 1024,
    cleanup_verified: true,
    gate_version: COMPANION_DATABASE_PERFORMANCE_GATE_VERSION,
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

function completeResults(overrides = {}) {
  return Object.keys(COMPANION_DATABASE_PERFORMANCE_WORKLOADS)
    .map((workload) => result('android', workload, overrides));
}

const numericFields = ['native_ms', 'candidate_ms', 'timer_resolution_ms',
  'native_peak_delta_bytes', 'candidate_peak_delta_bytes', 'bridge_blob_bytes'];
const invalidValues = [undefined, null, NaN, Infinity, -Infinity, -1, '0', false,
  'not_applicable', 'not_observed'];

it.each(numericFields.flatMap((field) => invalidValues.map((value) => [field, value])))('rejects invalid %s=%s for every workload', (field, value) => {
  const verdict = evaluateCompanionDatabasePerformanceResults(completeResults({ [field]: value }), ['android']);
  expect(verdict.passed).toBe(false);
  for (const workload of Object.keys(COMPANION_DATABASE_PERFORMANCE_WORKLOADS)) {
    expect(verdict.failures).toContainEqual(expect.stringContaining(`android/${workload}: invalid ${field}`));
  }
});

it('rejects missing bridge and memory evidence through the log parser', () => {
  const output = completeResults().map((entry) => {
    delete entry.bridge_blob_bytes;
    delete entry.native_peak_delta_bytes;
    delete entry.candidate_peak_delta_bytes;
    return `FOLIOLE_DATABASE_PERFORMANCE_RESULT=${JSON.stringify(entry)}`;
  }).join('\n');
  expect(evaluateCompanionDatabasePerformanceResults(
    parseCompanionDatabasePerformanceOutput(output), ['android']).passed).toBe(false);
});

it('rejects non-finite numbers from otherwise valid JSON logs', () => {
  const output = completeResults().map((entry) =>
    `FOLIOLE_DATABASE_PERFORMANCE_RESULT=${JSON.stringify(entry).replace('"candidate_ms":20', '"candidate_ms":1e309')}`
  ).join('\n');
  expect(evaluateCompanionDatabasePerformanceResults(
    parseCompanionDatabasePerformanceOutput(output), ['android']).passed).toBe(false);
});

it.each([undefined, 'not_observed', 'not_applicable', 'native_direct', 'invalid'])('does not certify an unobserved JS bridge (%s)', (bridge_observation) => {
  const verdict = evaluateCompanionDatabasePerformanceResults(completeResults({ bridge_observation }), ['android']);
  expect(verdict.passed).toBe(false);
  expect(verdict.failures).toContainEqual(expect.stringContaining('bridge observation'));
});

it.each([undefined, null, false, 1, 'true'])('requires verified cleanup (%s)', (cleanup_verified) => {
  expect(evaluateCompanionDatabasePerformanceResults(completeResults({ cleanup_verified }), ['android']).passed)
    .toBe(false);
});

it('requires a positive timer resolution but accepts measured zero elapsed time and memory growth', () => {
  expect(evaluateCompanionDatabasePerformanceResults(completeResults({ timer_resolution_ms: 0 }), ['android']).passed)
    .toBe(false);
  expect(evaluateCompanionDatabasePerformanceResults(completeResults({ native_ms: 0, candidate_ms: 0,
    native_peak_delta_bytes: 0, candidate_peak_delta_bytes: 0 }), ['android']).passed).toBe(true);
});

it('rejects contradictory duplicate evidence instead of selecting the first passing row', () => {
  const results = completeResults();
  results.push(result('android', 'control_write', { cleanup_verified: false }));
  expect(evaluateCompanionDatabasePerformanceResults(results, ['android']).passed).toBe(false);
});

it('keeps native direct measurements unproven even with a claimed zero bridge result', () => {
  const verdict = evaluateCompanionDatabasePerformanceResults(
    completeResults({ execution_scope: 'native_direct' }), ['android']);
  expect(verdict.passed).toBe(false);
  expect(verdict.failures).toHaveLength(5);
});

it('rejects old gate versions that allowed hardcoded bridge and early cleanup claims', () => {
  expect(evaluateCompanionDatabasePerformanceResults(completeResults({ gate_version: 1 }), ['android']).passed)
    .toBe(false);
});

it.each(Object.entries(COMPANION_DATABASE_PERFORMANCE_WORKLOADS))('preserves the time budget for %s', (workload, gate) => {
  const boundary = gate.maxCandidateMs ?? 10 * gate.maxRatio;
  const results = completeResults();
  const entry = results.find((item) => item.workload === workload);
  entry.candidate_ms = boundary;
  expect(evaluateCompanionDatabasePerformanceResults(results, ['android']).passed).toBe(true);
  entry.candidate_ms += 1;
  expect(evaluateCompanionDatabasePerformanceResults(results, ['android']).failures)
    .toContainEqual(expect.stringContaining('exceeds'));
});

it.each(['bridge_blob_bytes', 'native_peak_delta_bytes', 'candidate_peak_delta_bytes'])('rejects fractional and unsafe %s counts', (field) => {
  for (const value of [0.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(evaluateCompanionDatabasePerformanceResults(completeResults({ [field]: value }), ['android']).passed)
      .toBe(false);
  }
});

it('preserves the memory growth floor and ratio', () => {
  const results = completeResults({ candidate_peak_delta_bytes: 64 * 1024 * 1024 });
  expect(evaluateCompanionDatabasePerformanceResults(results, ['android']).passed).toBe(true);
  results[0].candidate_peak_delta_bytes += 1;
  expect(evaluateCompanionDatabasePerformanceResults(results, ['android']).passed).toBe(false);
  Object.assign(results[0], { native_peak_delta_bytes: 8 * 1024 * 1024,
    candidate_peak_delta_bytes: 80 * 1024 * 1024 });
  expect(evaluateCompanionDatabasePerformanceResults(results, ['android']).passed).toBe(true);
});
