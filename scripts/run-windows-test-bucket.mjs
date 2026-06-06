#!/usr/bin/env node
/* global console, process */

import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const WINDOWS_TEST_ROOT = 'scripts/windows';
const TEST_FILE_PATTERN = /\.test\.mjs$/;
const PREVIEW_RECOVERY_EXACT_FILES = new Set([
  'restart-electron-dev.test.mjs',
  'windows-client-native-restart.test.mjs',
  'windows-client-native-force-restart.test.mjs',
  'windows-client-native-startup-failure.test.mjs'
]);

function printUsage() {
  console.error('Usage: node scripts/run-windows-test-bucket.mjs <all|core|preview-recovery> <report.json>');
}

export function isWindowsPreviewRecoveryTest(filePath) {
  const fileName = path.basename(filePath);
  return fileName.startsWith('windows-preview') || PREVIEW_RECOVERY_EXACT_FILES.has(fileName);
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
      files.push(entryPath.replaceAll('\\', '/'));
    }
  }
  return files.sort();
}

export function selectWindowsTestBucketFiles(bucket, files) {
  if (bucket === 'all') {
    return files;
  }
  if (bucket === 'core') {
    return files.filter((file) => !isWindowsPreviewRecoveryTest(file));
  }
  if (bucket === 'preview-recovery') {
    return files.filter(isWindowsPreviewRecoveryTest);
  }
  return null;
}

function runVitest(reportPath, files) {
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
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function main() {
  const [bucket, reportPath] = process.argv.slice(2);
  const allFiles = collectTestFiles(WINDOWS_TEST_ROOT);
  const files = selectWindowsTestBucketFiles(bucket, allFiles);
  if (!files || !reportPath) {
    printUsage();
    return 1;
  }
  if (files.length === 0) {
    console.error(`[windows-test-bucket] no tests selected for bucket: ${bucket}`);
    return 1;
  }
  return runVitest(reportPath, files);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/run-windows-test-bucket.mjs')) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`[windows-test-bucket] ${error.message}`);
      process.exitCode = 1;
    });
}
