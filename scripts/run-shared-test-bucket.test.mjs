// @vitest-environment node

import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  combineReports,
  resolveTotalTimeoutMs,
  SHARED_TEST_BUCKETS,
  writeBucketFailureReport
} from './run-shared-test-bucket.mjs';
import { buildSharedBucketInvocation } from './shared-test-bucket-runtime.mjs';

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

async function collectTests(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) return collectTests(entryPath);
    return /\.test\.(?:mjs|mts|ts|tsx)$/u.test(entry.name)
      ? [entryPath.replaceAll('\\', '/')]
      : [];
  }));
  return nested.flat().sort();
}

async function expandSharedBucketTargets() {
  const targets = SHARED_TEST_BUCKETS
    .filter((bucket) => bucket.label.startsWith('shared-'))
    .flatMap((bucket) => bucket.targets);
  const expanded = await Promise.all(targets.map(async (target) => (
    (await stat(target)).isDirectory() ? collectTests(target) : [target]
  )));
  return expanded.flat().sort();
}

describe('run-shared-test-bucket', () => {
  it('keeps lib tests in their own shared bucket', () => {
    expect(SHARED_TEST_BUCKETS).toContainEqual({
      label: 'lib',
      report: '.tmp/vitest/shared-lib.json',
      targets: ['--exclude=src/**', '--exclude=electron/**', '--exclude=scripts/**']
    });
  });

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

  it('keeps split shared buckets covering every shared test exactly once', async () => {
    const selected = await expandSharedBucketTargets();

    expect(selected).toEqual(await collectTests('src/shared'));
    expect(new Set(selected).size).toBe(selected.length);
  });

  it('keeps default bucket labels and report paths unique', () => {
    const labels = SHARED_TEST_BUCKETS.map((bucket) => bucket.label);
    const reports = SHARED_TEST_BUCKETS.map((bucket) => bucket.report);

    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(reports).size).toBe(reports.length);
  });

  it('bounds companion root buckets to short-lived Windows Electron children', () => {
    const rootBuckets = SHARED_TEST_BUCKETS.filter(
      (bucket) => bucket.label.startsWith('shared-platform-companion-root-')
    );

    expect(rootBuckets.length).toBeGreaterThan(1);
    expect(rootBuckets.every((bucket) => bucket.targets.length <= 8)).toBe(true);
  });

  it('uses short-lived Electron-as-Node children under the Node bucket owner', async () => {
    const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
    expect(packageJson.scripts['test:release:shared']).toContain(
      'node scripts/run-shared-test-bucket.mjs'
    );
    expect(packageJson.scripts['test:release:shared']).not.toContain(
      'electron-sqlite-runner.mjs scripts/run-shared-test-bucket.mjs'
    );
    expect(buildSharedBucketInvocation(
      'report.json', ['src/shared'], '/electron', '/repo', { CI: 'true' }
    )).toEqual({
      args: [
        'scripts/run-vitest-with-summary.mjs', 'report.json', '--',
        '--silent=passed-only', '--pool=threads', '--maxWorkers=2',
        '--no-file-parallelism', 'src/shared'
      ],
      electronPath: '/electron',
      options: {
        cwd: '/repo',
        env: { CI: 'true', ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    });
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
