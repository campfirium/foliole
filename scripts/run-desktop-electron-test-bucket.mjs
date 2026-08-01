#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import {
  combineReports,
  readReport,
  removeOldReports,
  writeBucketFailureReport
} from './desktop-electron-test-bucket-report.mjs';

const TEST_FILE_PATTERN = /\.test\.(mjs|mts|ts|tsx)$/u;
const DATABASE_CHUNK_SIZE = 5;
const IMPORT_CHUNK_SIZE = 2;
const IPC_CHUNK_SIZE = 10;
const EPUB_IPC_CHUNK_SIZE = 3;
const MISSING_REPORT_RETRY_LIMIT = 3;
export const DESKTOP_ELECTRON_SHARDS = ['database', 'import', 'ipc', 'services'];
const SINGLE_FILE_IMPORT_BUCKETS = new Set([
  'electron/import/importManagerSettings.test.ts',
  'electron/import/importNodeMutationPatch.test.ts'
]);

function printUsage() {
  console.error('Usage: node scripts/run-desktop-electron-test-bucket.mjs <report.json> [database|import|ipc|services]');
}

function toPosix(filePath) {
  return filePath.replaceAll('\\', '/');
}

function collectTestFiles(dirPath) {
  const files = [];
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(entryPath));
      continue;
    }
    if (TEST_FILE_PATTERN.test(entry.name)) {
      files.push(toPosix(entryPath));
    }
  }
  return files.sort();
}

function collectRootElectronTests() {
  return readdirSync('electron', { withFileTypes: true })
    .filter((entry) => entry.isFile() && TEST_FILE_PATTERN.test(entry.name))
    .map((entry) => toPosix(path.join('electron', entry.name)))
    .sort();
}

export function collectElectronTestFiles() {
  return collectTestFiles('electron');
}

function collectElectronNamedScriptTests() {
  return collectTestFiles('scripts')
    .filter((file) => path.basename(file).includes('electron'));
}

function chunkFiles(labelPrefix, files, size) {
  const buckets = [];
  for (let index = 0; index < files.length; index += size) {
    const ordinal = String(Math.floor(index / size) + 1).padStart(2, '0');
    buckets.push({
      label: `${labelPrefix}-${ordinal}`,
      report: `.tmp/vitest/desktop-electron-${labelPrefix}-${ordinal}.json`,
      targets: files.slice(index, index + size)
    });
  }
  return buckets;
}

export function buildDesktopElectronBuckets() {
  const importFiles = collectTestFiles('electron/import');
  const singleImportFiles = importFiles.filter((file) => SINGLE_FILE_IMPORT_BUCKETS.has(file));
  const chunkedImportFiles = importFiles.filter((file) => !SINGLE_FILE_IMPORT_BUCKETS.has(file));
  const ipcFiles = collectTestFiles('electron/ipc');
  const epubIpcFiles = ipcFiles.filter((file) => path.basename(file).startsWith('epubImport'));
  const chunkedIpcFiles = ipcFiles.filter((file) => !epubIpcFiles.includes(file));
  return [
    ...chunkFiles('database', collectTestFiles('electron/database'), DATABASE_CHUNK_SIZE),
    ...singleImportFiles.map((file) => ({
      label: `import-${path.basename(file, '.test.ts')}`,
      report: `.tmp/vitest/desktop-electron-import-${path.basename(file, '.test.ts')}.json`,
      targets: [file],
      workers: 1
    })),
    ...chunkFiles('import', chunkedImportFiles, IMPORT_CHUNK_SIZE),
    ...chunkFiles('ipc-epub', epubIpcFiles, EPUB_IPC_CHUNK_SIZE),
    ...chunkFiles('ipc', chunkedIpcFiles, IPC_CHUNK_SIZE),
    { label: 'attachments', report: '.tmp/vitest/desktop-electron-attachments.json', targets: collectTestFiles('electron/attachments') },
    { label: 'sync', report: '.tmp/vitest/desktop-electron-sync.json', targets: collectTestFiles('electron/sync') },
    { label: 'mirror', report: '.tmp/vitest/desktop-electron-mirror.json', targets: collectTestFiles('electron/mirror') },
    { label: 'diagnostics', report: '.tmp/vitest/desktop-electron-diagnostics.json', targets: collectTestFiles('electron/diagnostics') },
    { label: 'agentControl', report: '.tmp/vitest/desktop-electron-agent-control.json', targets: collectTestFiles('electron/agentControl') },
    { label: 'assistant', report: '.tmp/vitest/desktop-electron-assistant.json', targets: collectTestFiles('electron/assistant') },
    { label: 'discourse', report: '.tmp/vitest/desktop-electron-discourse.json', targets: collectTestFiles('electron/discourse') },
    { label: 'foliole-publish', report: '.tmp/vitest/desktop-electron-foliole-publish.json', targets: collectTestFiles('electron/foliolePublish') },
    { label: 'security', report: '.tmp/vitest/desktop-electron-security.json', targets: collectTestFiles('electron/security') },
    { label: 'update', report: '.tmp/vitest/desktop-electron-update.json', targets: collectTestFiles('electron/update') },
    { label: 'wordpress', report: '.tmp/vitest/desktop-electron-wordpress.json', targets: collectTestFiles('electron/wordpress') },
    { label: 'root', report: '.tmp/vitest/desktop-electron-root.json', targets: collectRootElectronTests() },
    { label: 'scripts', report: '.tmp/vitest/desktop-electron-scripts.json', targets: collectElectronNamedScriptTests() }
  ].filter((bucket) => bucket.targets.length > 0);
}

function shardForBucket(bucket) {
  return DESKTOP_ELECTRON_SHARDS.find((shard) => bucket.label.startsWith(shard)) ?? 'services';
}

export function buildDesktopElectronShardBuckets(shard, buckets = buildDesktopElectronBuckets()) {
  if (!shard) {
    return buckets;
  }
  if (!DESKTOP_ELECTRON_SHARDS.includes(shard)) {
    throw new Error(`[desktop-electron-test-bucket] unknown shard: ${shard}`);
  }
  return buckets.filter((bucket) => shardForBucket(bucket) === shard);
}

function formatCoverageFailure(missing, duplicates) {
  const sections = [];
  if (missing.length > 0) {
    sections.push(`missing:\n${missing.map((file) => `- ${file}`).join('\n')}`);
  }
  if (duplicates.length > 0) {
    sections.push(`duplicate:\n${duplicates.map((file) => `- ${file}`).join('\n')}`);
  }
  return `[desktop-electron-test-bucket] coverage failure\n${sections.join('\n')}`;
}

export function assertDesktopElectronBucketCoverage(allFiles, buckets) {
  const allFileSet = new Set(allFiles);
  const counts = new Map();
  for (const file of buckets.flatMap((bucket) => bucket.targets)) {
    if (allFileSet.has(file)) {
      counts.set(file, (counts.get(file) ?? 0) + 1);
    }
  }
  const missing = allFiles.filter((file) => !counts.has(file));
  const duplicates = [...counts]
    .filter(([, count]) => count > 1)
    .map(([file]) => file)
    .sort();
  if (missing.length > 0 || duplicates.length > 0) {
    throw new Error(formatCoverageFailure(missing, duplicates));
  }
}

function runVitest(reportPath, targets, workers = 2) {
  const args = [
    'scripts/electron-sqlite-runner.mjs',
    'scripts/run-vitest-with-summary.mjs',
    reportPath,
    '--',
    '--silent=passed-only',
    '--pool=forks',
    `--maxWorkers=${workers}`,
    '--no-file-parallelism',
    '--testTimeout=30000',
    ...targets
  ];
  const child = spawn(process.execPath, args, { env: process.env, stdio: 'inherit' });
  return new Promise((resolve) => {
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function runBucket(bucket) {
  let code = await runVitest(bucket.report, bucket.targets, bucket.workers);
  for (let attempt = 1; code !== 0 && !readReport(bucket.report) && attempt <= MISSING_REPORT_RETRY_LIMIT; attempt += 1) {
    console.log(`[desktop-electron-test-bucket] retrying ${bucket.label} after missing report (${attempt}/${MISSING_REPORT_RETRY_LIMIT})`);
    rmSync(bucket.report, { force: true });
    code = await runVitest(bucket.report, bucket.targets, 1);
  }
  if (code !== 0 && !readReport(bucket.report)) {
    writeBucketFailureReport(bucket, `[desktop-electron-test-bucket] ${bucket.label} exited with code ${code} before writing its report`);
  }
  return code;
}

async function main() {
  const [reportPath, shard] = process.argv.slice(2);
  if (!reportPath) {
    printUsage();
    return 1;
  }
  const allBuckets = buildDesktopElectronBuckets();
  assertDesktopElectronBucketCoverage(collectElectronTestFiles(), allBuckets);
  const buckets = buildDesktopElectronShardBuckets(shard, allBuckets);
  removeOldReports(reportPath, buckets);
  combineReports(reportPath, buckets);
  let exitCode = 0;
  for (const bucket of buckets) {
    console.log(`[desktop-electron-test-bucket] running ${bucket.label}`);
    const code = await runBucket(bucket);
    if (code !== 0) {
      exitCode = code;
    }
    combineReports(reportPath, buckets);
  }
  return exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/run-desktop-electron-test-bucket.mjs')) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`[desktop-electron-test-bucket] ${error.message}`);
      process.exitCode = 1;
    });
}
