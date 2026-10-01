// @vitest-environment node
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseBenchmarkOptions, summarizeSamples, summarizeStartup } from './fixed-performance-summary.mjs';

test('retains chronological measurements without inventing tail percentiles', () => {
  const samples = [12, 3, 9, 6];
  assert.deepEqual(summarizeSamples(samples), {
    samples, count: 4, medianMs: 7.5, maximumMs: 12, firstMs: 12
  });
  assert.deepEqual(samples, [12, 3, 9, 6]);
  assert.equal(summarizeSamples([9, 2, 5]).medianMs, 5);
});

test('rejects missing or invalid samples instead of reporting zero', () => {
  for (const samples of [[], [NaN], [-1], [Infinity]]) {
    assert.throws(() => summarizeSamples(samples));
  }
});

test('periodic runs have fixed scale and finite duration', () => {
  assert.deepEqual(parseBenchmarkOptions(['monthly']).sizes, [100, 10000]);
  assert.equal(parseBenchmarkOptions(['monthly']).sustainedMs, 600_000);
  assert.equal(parseBenchmarkOptions([]).repeats, 3);
  assert.throws(() => parseBenchmarkOptions(['unknown']));
});

test('startup phases use the sampled process and keep missing stages unknown', () => {
  const events = [
    { pid: 1, stage: 'app_ready', timestamp: '2026-10-01T00:00:01Z' },
    { pid: 2, stage: 'boot_start', timestamp: '2026-10-01T00:00:02Z' },
    { pid: 2, stage: 'app_ready', timestamp: '2026-10-01T00:00:03Z' }
  ];
  assert.deepEqual(summarizeStartup(events, [{ pid: 2, creationTime: Date.parse('2026-10-01T00:00:01Z') }], 2), {
    processToReadyMs: 2000, rendererToBridgeMs: null, rendererToReadyMs: 1000, moduleImportMs: null
  });
});
