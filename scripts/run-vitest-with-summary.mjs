#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_SLOW_LIMIT = 10;

function parseArgs(argv) {
  const separatorIndex = argv.indexOf('--');
  const reportPath = argv[0];
  if (!reportPath || separatorIndex !== 1) {
    console.error('Usage: node scripts/run-vitest-with-summary.mjs <report.json> -- <vitest args...>');
    process.exit(1);
  }
  return { reportPath, vitestArgs: argv.slice(separatorIndex + 1) };
}

function resolveVitestBin() {
  return process.env.VITEST_BIN || path.join(process.cwd(), 'node_modules', '.bin', 'vitest');
}

function toNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatMs(value) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)}s`;
  }
  return `${value.toFixed(0)}ms`;
}

function readReport(reportPath) {
  try {
    return JSON.parse(readFileSync(reportPath, 'utf8'));
  } catch {
    return null;
  }
}

function collectFailures(report) {
  const failures = [];
  for (const result of report?.testResults ?? []) {
    for (const assertion of result.assertionResults ?? []) {
      if (assertion.status !== 'failed') {
        continue;
      }
      failures.push({
        file: result.name,
        title: assertion.fullName || assertion.title || '(unnamed test)'
      });
    }
  }
  return failures;
}

function collectSlowFiles(report) {
  return (report?.testResults ?? [])
    .map((result) => ({
      file: result.name,
      duration: toNumber(result.endTime) - toNumber(result.startTime)
    }))
    .filter((item) => item.file && item.duration > 0)
    .sort((left, right) => right.duration - left.duration);
}

function collectSlowTests(report) {
  const tests = [];
  for (const result of report?.testResults ?? []) {
    for (const assertion of result.assertionResults ?? []) {
      const duration = toNumber(assertion.duration);
      if (duration <= 0) {
        continue;
      }
      tests.push({
        file: result.name,
        title: assertion.fullName || assertion.title || '(unnamed test)',
        duration
      });
    }
  }
  return tests.sort((left, right) => right.duration - left.duration);
}

function printList(prefix, items, formatItem) {
  for (const [index, item] of items.entries()) {
    console.log(`[vitest-summary] ${prefix} ${index + 1}. ${formatItem(item)}`);
  }
}

function printSummary(reportPath) {
  const report = readReport(reportPath);
  if (!report) {
    console.log(`[vitest-summary] report unavailable: ${reportPath}`);
    return;
  }

  const failures = collectFailures(report);
  const slowLimit = Number.parseInt(process.env.VITEST_SUMMARY_SLOW_LIMIT || '', 10) || DEFAULT_SLOW_LIMIT;
  const slowFiles = collectSlowFiles(report).slice(0, slowLimit);
  const slowTests = collectSlowTests(report).slice(0, slowLimit);

  console.log(
    `[vitest-summary] totals: files ${report.numPassedTestSuites}/${report.numTotalTestSuites} passed, tests ${report.numPassedTests}/${report.numTotalTests} passed`
  );
  if (failures.length > 0) {
    console.log(`[vitest-summary] failed tests: ${failures.length}`);
    printList('fail', failures, (item) => `${item.file} :: ${item.title}`);
  }
  if (slowFiles.length > 0) {
    console.log(`[vitest-summary] slowest files: top ${slowFiles.length}`);
    printList('file', slowFiles, (item) => `${formatMs(item.duration)} ${item.file}`);
  }
  if (slowTests.length > 0) {
    console.log(`[vitest-summary] slowest tests: top ${slowTests.length}`);
    printList('test', slowTests, (item) => `${formatMs(item.duration)} ${item.file} :: ${item.title}`);
  }
}

async function main() {
  const { reportPath, vitestArgs } = parseArgs(process.argv.slice(2));
  mkdirSync(path.dirname(reportPath), { recursive: true });
  const args = ['run', '--reporter=dot', '--reporter=json', `--outputFile.json=${reportPath}`, ...vitestArgs];
  const child = spawn(resolveVitestBin(), args, { stdio: 'inherit' });
  const exitCode = await new Promise((resolve) => {
    child.on('close', (code) => resolve(code ?? 1));
  });
  printSummary(reportPath);
  process.exit(exitCode);
}

main();
