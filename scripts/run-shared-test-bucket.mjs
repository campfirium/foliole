#!/usr/bin/env node
/* global console, process */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { ensureElectronBinary } from './electron-runtime-binary.mjs';
import { assertElectronAbi } from './electron-sqlite-runner.mjs';
import { runSharedBucketVitest } from './shared-test-bucket-runtime.mjs';

export const SHARED_TEST_BUCKETS = [
  { label: 'lib', report: '.tmp/vitest/shared-lib.json', targets: ['--exclude=src/**', '--exclude=electron/**', '--exclude=scripts/**'] },
  { label: 'shared', report: '.tmp/vitest/shared-src-shared.json', targets: ['src/shared'] },
  { label: 'features-editor', report: '.tmp/vitest/shared-src-features-editor.json', targets: ['src/features/editor'] },
  { label: 'features-nodes', report: '.tmp/vitest/shared-src-features-nodes.json', targets: ['src/features/nodes'] },
  { label: 'features-settings', report: '.tmp/vitest/shared-src-features-settings.json', targets: ['src/features/settings'] },
  {
    label: 'features-review-docs',
    report: '.tmp/vitest/shared-src-features-review-docs.json',
    targets: ['src/features/review', 'src/features/pdf', 'src/features/image-cloze', 'src/features/formula-cloze']
  },
  {
    label: 'features-guided',
    report: '.tmp/vitest/shared-src-features-guided.json',
    targets: ['src/features/guidedSample', 'src/features/help']
  },
  { label: 'store', report: '.tmp/vitest/shared-src-store.json', targets: ['src/store'] },
  {
    label: 'scripts',
    report: '.tmp/vitest/shared-scripts.json',
    targets: [
      'scripts/check-settings-classification.test.mjs',
      'scripts/lint-changed.test.mjs',
      'scripts/vite-config.test.mjs'
    ]
  }
];

function printUsage() {
  console.error('Usage: node scripts/run-shared-test-bucket.mjs <report.json>');
}

function readReport(reportPath) {
  try {
    return JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch {
    return null;
  }
}

function parseNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

export function resolveTotalTimeoutMs(env = process.env) {
  const seconds = parseNonNegativeInt(
    env.SHARED_TEST_BUCKET_TOTAL_TIMEOUT_SECONDS,
    0
  );
  return seconds > 0 ? seconds * 1000 : null;
}

function addNumber(left, right, key) {
  return (left[key] ?? 0) + (right?.[key] ?? 0);
}

function emptyReport() {
  return {
    numFailedTestSuites: 0,
    numFailedTests: 0,
    numPassedTestSuites: 0,
    numPassedTests: 0,
    numPendingTestSuites: 0,
    numPendingTests: 0,
    numRuntimeErrorTestSuites: 0,
    numTodoTests: 0,
    numTotalTestSuites: 0,
    numTotalTests: 0,
    startTime: Date.now(),
    success: true,
    testResults: []
  };
}

export function combineReports(reportPath, buckets = SHARED_TEST_BUCKETS) {
  const reports = buckets.map((bucket) => readReport(bucket.report)).filter(Boolean);
  const combined = reports.reduce((acc, report) => ({
    numFailedTestSuites: addNumber(acc, report, 'numFailedTestSuites'),
    numFailedTests: addNumber(acc, report, 'numFailedTests'),
    numPassedTestSuites: addNumber(acc, report, 'numPassedTestSuites'),
    numPassedTests: addNumber(acc, report, 'numPassedTests'),
    numPendingTestSuites: addNumber(acc, report, 'numPendingTestSuites'),
    numPendingTests: addNumber(acc, report, 'numPendingTests'),
    numRuntimeErrorTestSuites: addNumber(acc, report, 'numRuntimeErrorTestSuites'),
    numTodoTests: addNumber(acc, report, 'numTodoTests'),
    numTotalTestSuites: addNumber(acc, report, 'numTotalTestSuites'),
    numTotalTests: addNumber(acc, report, 'numTotalTests'),
    startTime: Math.min(acc.startTime ?? Number.POSITIVE_INFINITY, report.startTime ?? Number.POSITIVE_INFINITY),
    success: (acc.success ?? true) && report.success !== false,
    testResults: [...(acc.testResults ?? []), ...(report.testResults ?? [])]
  }), emptyReport());

  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(combined, null, 2)}\n`, 'utf8');
}

function removeOldReports(reportPath, buckets = SHARED_TEST_BUCKETS) {
  for (const report of [reportPath, ...buckets.map((bucket) => bucket.report)]) {
    rmSync(report, { force: true });
  }
}

export function writeBucketFailureReport(bucket, message) {
  const now = Date.now();
  const report = {
    ...emptyReport(),
    numFailedTestSuites: 1,
    numFailedTests: 1,
    numTotalTestSuites: 1,
    numTotalTests: 1,
    success: false,
    testResults: [{
      assertionResults: [{
        ancestorTitles: ['shared test bucket'],
        failureMessages: [message],
        fullName: `shared test bucket ${bucket.label} wrote a report`,
        status: 'failed',
        title: `${bucket.label} wrote a report`
      }],
      endTime: now,
      message,
      name: `scripts/run-shared-test-bucket.mjs:${bucket.label}`,
      startTime: now,
      status: 'failed',
      summary: message
    }]
  };
  mkdirSync(path.dirname(bucket.report), { recursive: true });
  writeFileSync(bucket.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function main() {
  const [reportPath] = process.argv.slice(2);
  if (!reportPath) {
    printUsage();
    return 1;
  }

  let exitCode = 0;
  const repoRoot = process.cwd();
  const electronPath = ensureElectronBinary(repoRoot);
  assertElectronAbi(electronPath, repoRoot);
  const totalTimeoutMs = resolveTotalTimeoutMs();
  const deadline = totalTimeoutMs === null ? Number.POSITIVE_INFINITY : Date.now() + totalTimeoutMs;
  removeOldReports(reportPath);
  combineReports(reportPath);
  for (const bucket of SHARED_TEST_BUCKETS) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      writeBucketFailureReport(bucket, `[shared-test-bucket] ${bucket.label} skipped because total timeout was exhausted`);
      exitCode = 1;
      combineReports(reportPath);
      continue;
    }
    console.log(`[shared-test-bucket] running ${bucket.label}`);
    const { code, timedOut } = await runSharedBucketVitest(
      bucket.report,
      bucket.targets,
      remainingMs,
      electronPath,
      repoRoot
    );
    if (code !== 0) {
      exitCode = code;
      if (!readReport(bucket.report)) {
        const reason = timedOut
          ? `${bucket.label} exceeded remaining shared test budget`
          : `${bucket.label} exited with code ${code} before writing its report`;
        writeBucketFailureReport(bucket, `[shared-test-bucket] ${reason}`);
      }
    }
    combineReports(reportPath);
  }
  return exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/run-shared-test-bucket.mjs')) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`[shared-test-bucket] ${error.message}`);
      process.exitCode = 1;
    });
}
