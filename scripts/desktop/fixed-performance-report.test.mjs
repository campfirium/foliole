// @vitest-environment node
import { expect, test } from 'vitest';

import { compareBenchmarkReports } from './fixed-performance-report.mjs';

function report(value) {
  return { manifest: { machine: { platform: 'darwin', arch: 'arm64', model: 'fixed' },
    options: { fixtureVersion: 1 }, exitCode: 0 },
  scenarios: ['http', 'desktop'].flatMap((kind) => [100, 1000].map((size) => ({
    kind, size, completed: true, timings: { operation: { medianMs: value, maximumMs: value * 2 } }
  }))) };
}

test('compares matched observations without declaring performance qualified', () => {
  const result = compareBenchmarkReports(report(10), report(15));
  expect(result.comparable).toBe(true);
  expect(result.ratios).toHaveLength(4);
  expect(result.ratios[0].medianRatio).toBe(1.5);
});

test('refuses cross-device, changed conditions, and failed sample comparisons', () => {
  const previous = report(10);
  for (const change of [
    (value) => { value.manifest.machine.model = 'other'; },
    (value) => { value.manifest.options.fixtureVersion = 2; },
    (value) => { value.scenarios[0].completed = false; },
    (value) => { value.manifest.exitCode = 1; }
  ]) {
    const current = report(15);
    change(current);
    expect(compareBenchmarkReports(previous, current).comparable).toBe(false);
  }
});
