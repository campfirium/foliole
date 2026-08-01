#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  combineReports,
  readReport,
  removeOldReports
} from './desktop-electron-test-bucket-report.mjs';

const TEST_FILE_PATTERN = /\.test\.(mjs|mts|ts|tsx)$/u;
const CHUNK_SIZE = 30;
export const RELEASE_DESKTOP_SOURCE_SHARDS = ['one', 'two', 'three', 'four'];
const ROOT_TESTS = ['src/startupBootstrap.test.ts', 'src/startupViewMode.test.ts'];

function toPosix(filePath) {
  return filePath.replaceAll('\\', '/');
}

function collectTestFiles(dirPath) {
  const files = [];
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(entryPath));
    } else if (TEST_FILE_PATTERN.test(entry.name)) {
      files.push(toPosix(entryPath));
    }
  }
  return files;
}

export function collectReleaseDesktopSourceTestFiles() {
  return [...collectTestFiles('src/app'), ...collectTestFiles('src/test'), ...ROOT_TESTS].sort();
}

function chunkFiles(label, reportLabel, files, chunkSize) {
  const buckets = [];
  for (let index = 0; index < files.length; index += chunkSize) {
    const ordinal = String(Math.floor(index / chunkSize) + 1).padStart(2, '0');
    buckets.push({
      label: `${label}-${ordinal}`,
      report: `.tmp/vitest/release-desktop-src-${reportLabel}-${ordinal}.json`,
      targets: files.slice(index, index + chunkSize)
    });
  }
  return buckets;
}

export function buildReleaseDesktopSourceBuckets(files = collectReleaseDesktopSourceTestFiles()) {
  const appFiles = files.filter((file) => file.startsWith('src/app/'));
  const smokeFiles = files.filter((file) => file.startsWith('src/test/'));
  const rootFiles = files.filter((file) => ROOT_TESTS.includes(file));
  return [
    ...chunkFiles('app', 'app', appFiles, CHUNK_SIZE),
    ...chunkFiles('smoke', 'smoke', smokeFiles, 1),
    ...chunkFiles('root', 'root', rootFiles, ROOT_TESTS.length)
  ];
}

export function buildReleaseDesktopSourceShardBuckets(shard, buckets) {
  if (!shard) {
    return buckets;
  }
  const shardIndex = RELEASE_DESKTOP_SOURCE_SHARDS.indexOf(shard);
  if (shardIndex < 0) {
    throw new Error(`[release-desktop-source-test-bucket] unknown shard: ${shard}`);
  }
  return buckets.filter((_, index) => index % RELEASE_DESKTOP_SOURCE_SHARDS.length === shardIndex);
}

export function assertReleaseDesktopSourceBucketCoverage(files, buckets) {
  const counts = new Map();
  for (const file of buckets.flatMap((bucket) => bucket.targets)) {
    counts.set(file, (counts.get(file) ?? 0) + 1);
  }
  const missing = files.filter((file) => !counts.has(file));
  const duplicates = [...counts].filter(([, count]) => count > 1).map(([file]) => file).sort();
  if (missing.length > 0 || duplicates.length > 0) {
    throw new Error([
      '[release-desktop-source-test-bucket] coverage failure',
      ...missing.map((file) => `missing: ${file}`),
      ...duplicates.map((file) => `duplicate: ${file}`)
    ].join('\n'));
  }
}

export function buildReleaseDesktopSourceVitestArgs(bucket) {
  return [
    'scripts/run-vitest-with-summary.mjs',
    bucket.report,
    '--',
    '--silent=passed-only',
    '--pool=threads',
    '--maxWorkers=2',
    '--no-file-parallelism',
    '--testTimeout=15000',
    ...bucket.targets
  ];
}

function runVitest(bucket) {
  const args = buildReleaseDesktopSourceVitestArgs(bucket);
  const child = spawn(process.execPath, args, { env: process.env, stdio: 'inherit' });
  return new Promise((resolve) => child.on('close', (code) => resolve(code ?? 1)));
}

function writeMissingReport(bucket, code) {
  const now = Date.now();
  const message = `${bucket.label} exited with code ${code} before writing its report`;
  const report = {
    numFailedTestSuites: 1,
    numFailedTests: 1,
    numPassedTestSuites: 0,
    numPassedTests: 0,
    numPendingTestSuites: 0,
    numPendingTests: 0,
    numRuntimeErrorTestSuites: 0,
    numTodoTests: 0,
    numTotalTestSuites: bucket.targets.length,
    numTotalTests: 1,
    startTime: now,
    success: false,
    testResults: [{
      assertionResults: [{
        ancestorTitles: ['release desktop source test bucket'],
        failureMessages: [message],
        fullName: `release desktop source test bucket ${bucket.label} wrote a report`,
        status: 'failed',
        title: `${bucket.label} wrote a report`
      }],
      endTime: now,
      message,
      name: `scripts/run-release-desktop-source-test-bucket.mjs:${bucket.label}`,
      startTime: now,
      status: 'failed',
      summary: message
    }]
  };
  mkdirSync(path.dirname(bucket.report), { recursive: true });
  writeFileSync(bucket.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function main() {
  const [reportPath, shard] = process.argv.slice(2);
  if (!reportPath) {
    console.error('Usage: node scripts/run-release-desktop-source-test-bucket.mjs <report.json> [one|two|three|four]');
    return 1;
  }
  const files = collectReleaseDesktopSourceTestFiles();
  const allBuckets = buildReleaseDesktopSourceBuckets(files);
  assertReleaseDesktopSourceBucketCoverage(files, allBuckets);
  const buckets = buildReleaseDesktopSourceShardBuckets(shard, allBuckets);
  removeOldReports(reportPath, buckets);
  combineReports(reportPath, buckets);
  let exitCode = 0;
  for (const bucket of buckets) {
    console.log(`[release-desktop-source-test-bucket] running ${bucket.label}`);
    const code = await runVitest(bucket);
    if (code !== 0) {
      exitCode = code;
      if (!readReport(bucket.report)) {
        writeMissingReport(bucket, code);
      }
    }
    combineReports(reportPath, buckets);
  }
  return exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/run-release-desktop-source-test-bucket.mjs')) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(`[release-desktop-source-test-bucket] ${error.message}`);
    process.exitCode = 1;
  });
}
