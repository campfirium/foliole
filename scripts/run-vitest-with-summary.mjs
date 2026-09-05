#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import {
  collectFileTotals,
  readVitestReport,
  validateExpectedTestFiles
} from './vitest-report-contract.mjs';

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

function resolveVitestCommand() {
  const platform = process.env.VITEST_PLATFORM_FOR_TEST || process.platform;
  if (process.env.VITEST_BIN) {
    if (/\.[cm]?js$/i.test(process.env.VITEST_BIN)) {
      return {
        argsPrefix: [process.env.VITEST_BIN],
        command: process.execPath,
        shell: false
      };
    }
    return {
      argsPrefix: [],
      command: process.env.VITEST_BIN,
      shell: platform === 'win32' && /\.cmd$/i.test(process.env.VITEST_BIN)
    };
  }

  const moduleEntry = path.join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs');
  if (existsSync(moduleEntry)) {
    return { argsPrefix: [moduleEntry], command: process.execPath, shell: false };
  }

  const binName = platform === 'win32' ? 'vitest.cmd' : 'vitest';
  return {
    argsPrefix: [],
    command: path.join(process.cwd(), 'node_modules', '.bin', binName),
    shell: platform === 'win32'
  };
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

function normalizeBooleanEnv(value) {
  if (value === '1' || value === 'true') {
    return true;
  }
  if (value === '0' || value === 'false') {
    return false;
  }
  return null;
}

function removeMaxWorkersArgs(args) {
  const nextArgs = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--maxWorkers') {
      index += 1;
      continue;
    }
    if (arg.startsWith('--maxWorkers=')) {
      continue;
    }
    nextArgs.push(arg);
  }
  return nextArgs;
}

function resolveVitestArgs(vitestArgs, env) {
  let args = [...vitestArgs];
  const pool = env.VITEST_POOL || '';
  if (pool) {
    if (!['forks', 'threads'].includes(pool)) throw new Error(`Unsupported VITEST_POOL: ${pool}`);
    args = args.filter((arg) => !arg.startsWith('--pool='));
    args.unshift(`--pool=${pool}`);
  }
  const maxWorkers = env.VITEST_MAX_WORKERS || '';
  if (maxWorkers) {
    args = removeMaxWorkersArgs(args);
    args.unshift(`--maxWorkers=${maxWorkers}`);
  }

  const fileParallelism = normalizeBooleanEnv(env.VITEST_FILE_PARALLELISM || '');
  if (fileParallelism === true) {
    args = args.filter((arg) => arg !== '--no-file-parallelism' && arg !== '--fileParallelism=false');
  } else if (fileParallelism === false && !args.includes('--no-file-parallelism')) {
    args.unshift('--no-file-parallelism');
  }

  return args;
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
  const report = readVitestReport(reportPath);
  if (!report) {
    console.log(`[vitest-summary] report unavailable: ${reportPath}`);
    return;
  }

  const failures = collectFailures(report);
  const slowLimit = Number.parseInt(process.env.VITEST_SUMMARY_SLOW_LIMIT || '', 10) || DEFAULT_SLOW_LIMIT;
  const slowFiles = collectSlowFiles(report).slice(0, slowLimit);
  const slowTests = collectSlowTests(report).slice(0, slowLimit);
  const files = collectFileTotals(report);

  console.log(
    `[vitest-summary] totals: files ${files.passed}/${files.total} passed, suites ${report.numPassedTestSuites}/${report.numTotalTestSuites} passed, tests ${report.numPassedTests}/${report.numTotalTests} passed`
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
  rmSync(reportPath, { force: true });
  const args = [
    'run',
    '--reporter=dot',
    '--reporter=json',
    `--outputFile.json=${reportPath}`,
    ...resolveVitestArgs(vitestArgs, process.env)
  ];
  const vitestCommand = resolveVitestCommand();
  const vitestEnv = { ...process.env };
  delete vitestEnv.FOLIOLE_EXPECTED_TEST_FILES;
  const exitCode = await runVitest(vitestCommand, args, vitestEnv);
  printSummary(reportPath);
  const report = readVitestReport(reportPath);
  const expectedFilesSatisfied = !process.env.FOLIOLE_EXPECTED_TEST_FILES || Boolean(
    report && validateExpectedTestFiles(report, process.env.FOLIOLE_EXPECTED_TEST_FILES)
  );
  process.exit(exitCode === 0 && expectedFilesSatisfied ? 0 : 1);
}

function runVitest(vitestCommand, args, env) {
  const child = spawn(vitestCommand.command, [...vitestCommand.argsPrefix, ...args], {
    env,
    shell: vitestCommand.shell,
    stdio: 'inherit'
  });
  return new Promise((resolve) => {
    let settled = false;
    const finish = (code) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(code);
    };
    child.on('error', (error) => {
      console.error(`[vitest-summary] failed to start vitest: ${error.message}`);
      finish(1);
    });
    child.on('close', (code) => finish(code ?? 1));
  });
}

main();
