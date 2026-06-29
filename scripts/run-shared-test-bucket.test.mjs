// @vitest-environment node

import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  combineReports,
  resolveTotalTimeoutMs,
  SHARED_TEST_BUCKETS,
  writeBucketFailureReport
} from './run-shared-test-bucket.mjs';

function report(overrides = {}) {
  return {
    numFailedTestSuites: 0,
    numFailedTests: 0,
    numPassedTestSuites: 1,
    numPassedTests: 2,
    numPendingTestSuites: 0,
    numPendingTests: 0,
    numRuntimeErrorTestSuites: 0,
    numTodoTests: 0,
    numTotalTestSuites: 1,
    numTotalTests: 2,
    startTime: 10,
    success: true,
    testResults: [{ name: overrides.name ?? 'bucket.json', status: 'passed' }],
    ...overrides
  };
}

describe('run-shared-test-bucket', () => {
  it('keeps split feature buckets covering every top-level feature directory', async () => {
    const featureTargets = SHARED_TEST_BUCKETS.flatMap((bucket) => bucket.targets)
      .filter((target) => target.startsWith('src/features/'))
      .map((target) => target.slice('src/features/'.length))
      .sort();
    const featureDirectories = (await readdir('src/features', { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(SHARED_TEST_BUCKETS.some((bucket) => bucket.targets.includes('src/features'))).toBe(false);
    expect(featureTargets).toEqual(featureDirectories);
  });

  it('keeps default bucket labels and report paths unique', () => {
    const labels = SHARED_TEST_BUCKETS.map((bucket) => bucket.label);
    const reports = SHARED_TEST_BUCKETS.map((bucket) => bucket.report);

    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(reports).size).toBe(reports.length);
  });

  it('leaves the shared bucket total timeout disabled unless explicitly configured', () => {
    expect(resolveTotalTimeoutMs({})).toBeNull();
    expect(resolveTotalTimeoutMs({ SHARED_TEST_BUCKET_TOTAL_TIMEOUT_SECONDS: '42' })).toBe(42000);
  });

  it('writes an aggregate report from completed child bucket reports', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'shared-test-bucket-'));
    try {
      const firstReport = path.join(tempRoot, 'first.json');
      const secondReport = path.join(tempRoot, 'second.json');
      const aggregateReport = path.join(tempRoot, 'aggregate.json');
      await writeFile(firstReport, `${JSON.stringify(report({ name: 'first' }))}\n`, 'utf8');
      await writeFile(
        secondReport,
        `${JSON.stringify(report({ name: 'second', numFailedTests: 1, numPassedTests: 1, success: false }))}\n`,
        'utf8'
      );

      combineReports(aggregateReport, [
        { label: 'first', report: firstReport, targets: [] },
        { label: 'second', report: secondReport, targets: [] }
      ]);

      const aggregate = JSON.parse(await readFile(aggregateReport, 'utf8'));
      expect(aggregate.success).toBe(false);
      expect(aggregate.numFailedTests).toBe(1);
      expect(aggregate.numPassedTests).toBe(3);
      expect(aggregate.testResults.map((result) => result.name)).toEqual(['first', 'second']);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('writes an empty aggregate when no child bucket has reported yet', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'shared-test-bucket-'));
    try {
      const aggregateReport = path.join(tempRoot, 'aggregate.json');

      combineReports(aggregateReport, [{ label: 'missing', report: path.join(tempRoot, 'missing.json'), targets: [] }]);

      const aggregate = JSON.parse(await readFile(aggregateReport, 'utf8'));
      expect(aggregate.success).toBe(true);
      expect(aggregate.numTotalTests).toBe(0);
      expect(aggregate.testResults).toEqual([]);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it('writes a readable synthetic report when a child bucket exits without a report', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'shared-test-bucket-'));
    try {
      const bucketReport = path.join(tempRoot, 'missing.json');

      writeBucketFailureReport(
        { label: 'features', report: bucketReport, targets: [] },
        '[shared-test-bucket] features exceeded remaining shared test budget'
      );

      const childReport = JSON.parse(await readFile(bucketReport, 'utf8'));
      expect(childReport.success).toBe(false);
      expect(childReport.testResults[0].message).toContain('features exceeded remaining shared test budget');
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
