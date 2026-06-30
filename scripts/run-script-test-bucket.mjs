#!/usr/bin/env node
/* global console, process */

import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { collectScriptTestFiles, selectScriptTestBucketFiles } from './script-test-bucket-selection.mjs';
import { runIntegrationAggregate } from './script-test-bucket-aggregate.mjs';

const DEFAULT_BUCKET_TIMEOUT_SECONDS = 240;
const BUCKET_TIMEOUT_SECONDS = {
  core: 360
};

function printUsage() {
  console.error(
    'Usage: node scripts/run-script-test-bucket.mjs <all|core|gate|gate-integration*|node|preview> <report.json>'
  );
}

export function resolveBucketTimeoutSeconds(bucket) {
  const envName = `SCRIPT_TEST_BUCKET_${bucket.toUpperCase().replaceAll(/[^A-Z0-9]/gu, '_')}_TIMEOUT_SECONDS`;
  const fallback = BUCKET_TIMEOUT_SECONDS[bucket] ?? DEFAULT_BUCKET_TIMEOUT_SECONDS;
  const raw = process.env[envName] ?? process.env.SCRIPT_TEST_BUCKET_TIMEOUT_SECONDS ?? `${fallback}`;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function writeBucketTimeoutReport(reportPath, bucket, timeoutSeconds, files) {
  mkdirSync(path.dirname(reportPath), { recursive: true });
  const now = Date.now();
  const message = `[script-test-bucket] ${bucket} exceeded timeout (${timeoutSeconds}s)`;
  const report = {
    numFailedTestSuites: 1,
    numFailedTests: 1,
    numPassedTestSuites: 0,
    numPassedTests: 0,
    numPendingTestSuites: 0,
    numPendingTests: 0,
    numRuntimeErrorTestSuites: 0,
    numTodoTests: 0,
    numTotalTestSuites: files.length,
    numTotalTests: 1,
    openHandles: [],
    snapshot: {},
    startTime: now,
    success: false,
    testResults: [
      {
        assertionResults: [
          {
            ancestorTitles: ['script test bucket'],
            duration: timeoutSeconds * 1000,
            failureMessages: [message],
            fullName: `script test bucket ${bucket} completed within ${timeoutSeconds}s`,
            status: 'failed',
            title: `${bucket} completed within ${timeoutSeconds}s`
          }
        ],
        endTime: now,
        message,
        name: `scripts/run-script-test-bucket.mjs:${bucket}`,
        startTime: now - timeoutSeconds * 1000,
        status: 'failed',
        summary: `${files.length} selected files timed out before Vitest wrote its report.`
      }
    ],
    wasInterrupted: true
  };
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function terminateChildTree(child) {
  if (!child.pid) {
    child.kill('SIGTERM');
    return;
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', timeout: 1000 });
    return;
  }
  child.kill('SIGTERM');
  globalThis.setTimeout(() => child.kill('SIGKILL'), 1000).unref();
}

function runVitest(bucket, reportPath, files) {
  const timeoutSeconds = resolveBucketTimeoutSeconds(bucket);
  const args = [
    'scripts/run-vitest-with-summary.mjs',
    reportPath,
    '--',
    '--silent=passed-only',
    '--pool=threads',
    '--maxWorkers=2',
    '--no-file-parallelism',
    ...files
  ];
  const child = spawn(process.execPath, args, { env: process.env, stdio: 'inherit' });
  return new Promise((resolve) => {
    let settled = false;
    const finish = (code) => {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timer);
      resolve(code);
    };
    const timer = globalThis.setTimeout(() => {
      console.error(`[script-test-bucket] ${bucket} exceeded timeout (${timeoutSeconds}s)`);
      writeBucketTimeoutReport(reportPath, bucket, timeoutSeconds, files);
      terminateChildTree(child);
      finish(1);
      process.exitCode = 1;
      globalThis.setTimeout(() => process.exit(1), 10).unref();
    }, timeoutSeconds * 1000);
    timer.unref();
    child.on('close', (code) => finish(code ?? 1));
  });
}

async function main() {
  const [bucket, reportPath] = process.argv.slice(2);
  if (bucket === 'gate-integration' && reportPath) {
    return runIntegrationAggregate(reportPath, resolveBucketTimeoutSeconds('gate-integration'));
  }
  const files = selectScriptTestBucketFiles(bucket, collectScriptTestFiles());
  if (!files || !reportPath) {
    printUsage();
    return 1;
  }
  if (files.length === 0) {
    console.error(`[script-test-bucket] no tests selected for bucket: ${bucket}`);
    return 1;
  }
  return runVitest(bucket, reportPath, files);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/run-script-test-bucket.mjs')) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`[script-test-bucket] ${error.message}`);
      process.exitCode = 1;
    });
}
