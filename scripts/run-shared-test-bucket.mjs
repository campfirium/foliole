#!/usr/bin/env node
/* global console, process */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const BUCKETS = [
  { label: 'shared', report: '.tmp/vitest/shared-src-shared.json', targets: ['src/shared'] },
  { label: 'features', report: '.tmp/vitest/shared-src-features.json', targets: ['src/features'] },
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

function addNumber(left, right, key) {
  return (left[key] ?? 0) + (right?.[key] ?? 0);
}

function combineReports(reportPath) {
  const reports = BUCKETS.map((bucket) => readReport(bucket.report)).filter(Boolean);
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
    testResults: [...(acc.testResults ?? []), ...(report.testResults ?? [])]
  }), { testResults: [] });

  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(combined, null, 2)}\n`, 'utf8');
}

function runVitest(reportPath, targets) {
  const args = [
    'scripts/run-vitest-with-summary.mjs',
    reportPath,
    '--',
    '--silent=passed-only',
    '--pool=threads',
    '--maxWorkers=2',
    '--no-file-parallelism',
    ...targets
  ];
  const child = spawn(process.execPath, args, { env: process.env, stdio: 'inherit' });
  return new Promise((resolve) => {
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function main() {
  const [reportPath] = process.argv.slice(2);
  if (!reportPath) {
    printUsage();
    return 1;
  }

  let exitCode = 0;
  for (const bucket of BUCKETS) {
    console.log(`[shared-test-bucket] running ${bucket.label}`);
    const code = await runVitest(bucket.report, bucket.targets);
    if (code !== 0) exitCode = code;
  }
  combineReports(reportPath);
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
