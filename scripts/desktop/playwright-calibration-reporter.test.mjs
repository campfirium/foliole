// @vitest-environment node
import { expect, it } from 'vitest';

import { calibrationWarnings } from './playwright-calibration-reporter.mjs';

const test = (annotations = []) => ({ annotations, titlePath: () => ['', 'spec.ts', 'journey'] });

it('warns when a test is slower than its in-test calibration but keeps it passing', () => {
  const result = { annotations: [{ type: 'calibrated-ms', description: '180000' }], duration: 200_000, retry: 0, status: 'passed' };
  expect(calibrationWarnings(test(), result, 120_000)).toEqual([
    '::warning::Slower than calibrated: spec.ts › journey took 200000ms (calibrated 180000ms)'
  ]);
  expect(calibrationWarnings(test(), { ...result, duration: 150_000 }, 120_000)).toEqual([]);
});

it('falls back to the default calibration and flags a pass that needed a retry', () => {
  expect(calibrationWarnings(test(), { duration: 130_000, retry: 1, status: 'passed' }, 120_000)).toEqual([
    '::warning::Slower than calibrated: spec.ts › journey took 130000ms (calibrated 120000ms)',
    '::warning::Passed only on retry 1: spec.ts › journey'
  ]);
});
